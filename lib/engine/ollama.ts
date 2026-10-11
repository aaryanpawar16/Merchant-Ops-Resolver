import OpenAI from "openai";
import { instrumentClient } from "@/lib/engine/telemetry";
import type { LlmInfo } from "@/lib/engine/types";

// Local Ollama client. llama2 has no tool calling, so it only writes reasoning text.
// Every decision that changes state is made by deterministic code, never by the model.
const HOST = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
export const MODEL = process.env.OLLAMA_MODEL ?? "llama2";

const g = globalThis as unknown as { __ollama?: { at: number; available: boolean } };

export async function ollamaStatus(): Promise<Omit<LlmInfo, "enabled">> {
  const cached = g.__ollama;
  if (cached && Date.now() - cached.at < 10_000) return { provider: "ollama", model: MODEL, available: cached.available };
  let available = false;
  try {
    const res = await fetch(`${HOST}/api/tags`, { signal: AbortSignal.timeout(1500), cache: "no-store" });
    if (res.ok) {
      const body = (await res.json()) as { models?: { name: string }[] };
      available = (body.models ?? []).some((m) => m.name === MODEL || m.name.startsWith(`${MODEL}:`));
    }
  } catch {
    available = false;
  }
  g.__ollama = { at: Date.now(), available };
  return { provider: "ollama", model: MODEL, available };
}

// Loads the model into memory ahead of the first run so the first call is not a cold start.
export async function warmModel() {
  try {
    await fetch(`${HOST}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, prompt: "ok", stream: false, keep_alive: "30m", options: { num_predict: 1 } }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    // warming is best effort
  }
}

// Ollama unloads an idle model after about 5 minutes, and a reload costs 10 to 15 s. The OpenAI-compatible
// endpoint cannot ask for a longer keep-alive, so the model is warmed again when it may have gone cold.
const w = globalThis as unknown as { __warmAt?: number };

export function warmIfStale(maxAgeMs = 3 * 60_000) {
  if (Date.now() - (w.__warmAt ?? 0) < maxAgeMs) return;
  w.__warmAt = Date.now();
  void warmModel();
}

// Measured speed of the local model in tokens per second, or null before the first call. Optional text,
// such as a ruling explanation, is only requested from a model that is fast enough to not hold up the run.
const measured = globalThis as unknown as { __modelSpeed?: { tps?: number } };
const speed = (measured.__modelSpeed ??= {});

export function modelSpeed(): number | null {
  return speed.tps ?? null;
}

export type Thought = { text: string; tokensIn: number; tokensOut: number; ms: number };

type ThinkOptions = { system: string; prompt: string; maxTokens?: number; timeoutMs?: number; maxWaitMs?: number };

// Ollama answers one request at a time on a laptop, so calls share a queue. Each call gets its own
// timeout from the moment it starts, and a call that waited too long in line is skipped.
const q = globalThis as unknown as { __ollamaTail?: Promise<unknown> };

export function think(opts: ThinkOptions): Promise<Thought | null> {
  const queuedAt = Date.now();
  const job = (q.__ollamaTail ?? Promise.resolve()).then(() => (Date.now() - queuedAt > (opts.maxWaitMs ?? 45_000) ? null : call(opts)));
  q.__ollamaTail = job.catch(() => null);
  return job;
}

// Ollama speaks the OpenAI chat protocol on /v1, so the standard client works. The client is wrapped
// for neatlogs once, which records every call as an LLM span with its model and token counts.
const c = globalThis as unknown as { __llmClient?: OpenAI };

function client(): OpenAI {
  c.__llmClient ??= instrumentClient(new OpenAI({ baseURL: `${HOST}/v1`, apiKey: "ollama", maxRetries: 0 }));
  return c.__llmClient;
}

async function call(opts: ThinkOptions): Promise<Thought | null> {
  const started = Date.now();
  try {
    const res = await client().chat.completions.create(
      {
        model: MODEL,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.prompt },
        ],
        temperature: 0.2,
        max_tokens: opts.maxTokens ?? 120,
      },
      { signal: AbortSignal.timeout(opts.timeoutMs ?? 35_000) },
    );
    const choice = res.choices[0];
    let text = clean(choice?.message?.content ?? "");
    // When the token cap cut the reply off, keep only the complete sentences.
    if (choice?.finish_reason === "length") {
      const end = Math.max(text.lastIndexOf(". "), text.lastIndexOf("? "), text.lastIndexOf("! "), /[.?!]$/.test(text) ? text.length - 1 : -1);
      // Not even one complete sentence, so the text is unusable. The caller falls back to its own wording.
      if (end <= 20) return null;
      text = text.slice(0, end + 1);
    }
    if (!text) return null;
    const tokensOut = res.usage?.completion_tokens ?? 0;
    const ms = Date.now() - started;
    // Whole-call throughput, prompt reading included, so it errs on the slow side.
    if (tokensOut >= 8 && ms > 0) speed.tps = tokensOut / (ms / 1000);
    return { text, tokensIn: res.usage?.prompt_tokens ?? 0, tokensOut, ms };
  } catch {
    return null;
  }
}

// Strips the chatty wrappers llama2 likes to add, and keeps the text to plain sentences.
function clean(raw: string): string {
  let text = raw.trim();
  text = text.replace(/^(sure|certainly|of course|okay)[^\n]*\n+/i, "");
  text = text.replace(/^["']|["']$/g, "");
  text = text.replace(/[\u2013\u2014]/g, "-");
  return text.replace(/\n{3,}/g, "\n\n").trim();
}
