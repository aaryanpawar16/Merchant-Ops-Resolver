import { randomBytes } from "node:crypto";
import { CheckpointChain } from "@/lib/engine/checkpoints";
import { emptyCost, ASSUMPTIONS, llmCost } from "@/lib/engine/economics";
import { MODEL, think } from "@/lib/engine/ollama";
import { traced, tracedTool } from "@/lib/engine/telemetry";
import { seedWorld, type World } from "@/lib/engine/world";
import type { AgentId, AgentState, Attr, Checkpoint, Cost, LogLevel, RunEvent, Span, SpanKind, SpanStatus } from "@/lib/engine/types";

export class ToolTimeout extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolTimeout";
  }
}

type ToolOptions<T> = {
  latency: number;
  attrs?: Record<string, Attr>;
  // Which neatlogs span kind this call is. Defaults to a plain TOOL.
  neatlogs?: "TOOL" | "RETRIEVER" | "GUARDRAIL";
  // Extra attributes to record on a RETRIEVER or GUARDRAIL span once the result is known.
  annotate?: (result: T) => Record<string, Attr>;
};

const hex = (bytes: number) => randomBytes(bytes).toString("hex");

function brief(value: unknown, max = 150): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

// Everything one run needs: the world, the trace, the checkpoint chain, cost and the event stream.
export class RunContext {
  readonly id = `run_${hex(4)}`;
  readonly traceId = hex(16);
  readonly t0 = Date.now();
  readonly chain = new CheckpointChain();
  readonly spans = new Map<string, Span>();
  readonly cost: Cost = emptyCost();
  readonly pending: Promise<unknown>[] = [];
  private chaosLeft: boolean;

  constructor(
    readonly speed: number,
    readonly chaos: boolean,
    readonly llmOn: boolean,
    readonly emit: (event: RunEvent) => void,
    // The simulated world this case lives in. A batch passes one shared world, so cases affect each other.
    readonly world: World = seedWorld(),
    // ambiguous: a timed-out write really went through. unsafeRetry: retries use a fresh idempotency key,
    // which is what a careless agent does. It exists only to show the double payment the real one prevents.
    readonly flags: { ambiguous: boolean; unsafeRetry: boolean } = { ambiguous: false, unsafeRetry: false },
  ) {
    this.chaosLeft = chaos;
  }

  now() {
    return Date.now() - this.t0;
  }

  // Simulated latency. Scaled by speed so tests can run instantly.
  sleep(ms: number) {
    const scaled = ms * this.speed;
    return scaled <= 0 ? Promise.resolve() : new Promise<void>((resolve) => setTimeout(resolve, scaled));
  }

  // True exactly once when chaos is on: the first write to an external system times out.
  chaosHit() {
    if (!this.chaosLeft) return false;
    this.chaosLeft = false;
    return true;
  }

  log(agent: AgentId, level: LogLevel, text: string) {
    this.emit({ type: "log", atMs: this.now(), agent, level, text });
  }

  agent(agent: AgentId, state: AgentState) {
    this.emit({ type: "agent", agent, state });
  }

  status(status: string, tone: "fault" | "work" | "ok", repair: number) {
    this.emit({ type: "status", status, tone, repair });
  }

  pushCost() {
    const c = this.cost;
    c.totalUsd = c.llmUsd + c.infraUsd;
    this.emit({ type: "cost", cost: { ...c } });
  }

  startSpan(kind: SpanKind, name: string, agent: AgentId, parent: Span | null, attrs: Record<string, Attr> = {}): Span {
    const span: Span = {
      id: hex(8),
      parentId: parent?.id ?? null,
      kind,
      name,
      agent,
      startMs: this.now(),
      endMs: null,
      status: "running",
      attrs,
    };
    this.spans.set(span.id, span);
    this.emit({ type: "span.start", span: { ...span } });
    return span;
  }

  endSpan(span: Span, status: SpanStatus = "ok", extra: Partial<Pick<Span, "tokensIn" | "tokensOut" | "costUsd">> & { attrs?: Record<string, Attr> } = {}) {
    span.endMs = this.now();
    span.status = status;
    if (extra.attrs) span.attrs = { ...span.attrs, ...extra.attrs };
    if (extra.tokensIn !== undefined) span.tokensIn = extra.tokensIn;
    if (extra.tokensOut !== undefined) span.tokensOut = extra.tokensOut;
    if (extra.costUsd !== undefined) span.costUsd = extra.costUsd;
    this.emit({ type: "span.end", span: { ...span } });
  }

  // Runs an agent as a span, keeping the agent graph and the trace in step. It is also a neatlogs
  // AGENT span, so everything the agent does nests under it there.
  async asAgent<T>(agent: AgentId, name: string, parent: Span | null, body: (span: Span) => Promise<T>): Promise<T> {
    const span = this.startSpan("agent", name, agent, parent);
    this.agent(agent, "active");
    try {
      const result = await traced({ name, kind: "AGENT", attributes: { "resolver.agent": agent } }, () => body(span));
      this.endSpan(span, "ok");
      this.agent(agent, "done");
      return result;
    } catch (error) {
      this.endSpan(span, "error", { attrs: { error: error instanceof Error ? error.message : "unknown" } });
      this.agent(agent, "error");
      throw error;
    }
  }

  // A decision step (a ruling, a retry strategy, a verification) that may contain tool calls of its own.
  // `body` may add to `span.attrs`. `statusOf` lets the result decide whether the step counts as failed.
  async decision<T>(
    agent: AgentId,
    name: string,
    parent: Span | null,
    attrs: Record<string, Attr>,
    body: (span: Span) => Promise<T>,
    statusOf: (result: T) => SpanStatus = () => "ok",
  ): Promise<T> {
    const span = this.startSpan("decision", name, agent, parent, attrs);
    try {
      const result = await traced({ name, kind: "CHAIN", attributes: { "resolver.agent": agent, ...attrs } }, () => body(span));
      this.endSpan(span, statusOf(result));
      return result;
    } catch (error) {
      this.endSpan(span, "error", { attrs: { error: error instanceof Error ? error.message : "unknown" } });
      throw error;
    }
  }

  // One tool call: a span, a log line, simulated latency, and infrastructure cost. In neatlogs it is a
  // TOOL span, or a RETRIEVER / GUARDRAIL span for the memory lookup and the policy check.
  async tool<T>(agent: AgentId, parent: Span | null, name: string, args: Record<string, Attr>, options: ToolOptions<T>, impl: () => T): Promise<T> {
    const span = this.startSpan("tool", name, agent, parent, { ...args, ...options.attrs });
    this.log(agent, "info", `${name}(${Object.values(args).map(String).join(", ")})`);

    const exec = async () => {
      await this.sleep(options.latency);
      this.cost.toolCalls += 1;
      this.cost.infraUsd += ASSUMPTIONS.infraUsdPerToolCall;
      return impl();
    };

    try {
      const kind = options.neatlogs ?? "TOOL";
      const result =
        kind === "TOOL"
          ? await tracedTool(name, args, exec)
          : await traced({ name, kind, input: args }, async (neat) => {
              const out = await exec();
              for (const [key, value] of Object.entries(options.annotate?.(out) ?? {})) neat.setAttribute(key, value);
              return out;
            });
      this.endSpan(span, "ok", { attrs: { result: brief(result) }, costUsd: ASSUMPTIONS.infraUsdPerToolCall });
      this.pushCost();
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "tool failed";
      this.endSpan(span, "error", { attrs: { error: message }, costUsd: ASSUMPTIONS.infraUsdPerToolCall });
      this.pushCost();
      throw error;
    }
  }

  checkpoint(agent: AgentId, label: string, state: Record<string, unknown>, parent: Span | null): Checkpoint {
    const checkpoint = this.chain.create(agent, label, state, this.now());
    const span = this.startSpan("checkpoint", `checkpoint ${label}`, agent, parent, { id: checkpoint.id, hash: checkpoint.hash.slice(0, 12) });
    this.endSpan(span, "ok");
    this.emit({ type: "checkpoint", checkpoint });
    this.log(agent, "info", `Checkpoint saved: ${checkpoint.id} (${label})`);
    // A checkpoint is instant, so it shows in neatlogs as a short step with its id and hash.
    void traced({ name: `checkpoint ${label}`, kind: "CHAIN", attributes: { "checkpoint.id": checkpoint.id, "checkpoint.hash": checkpoint.hash } }, async () => undefined);
    return checkpoint;
  }

  // Asks llama2 for a short piece of reasoning text. Falls back to `fallback` when the model is off,
  // missing or slow, so the run never depends on it. Returns whether the model really wrote the text.
  async narrate(opts: {
    agent: AgentId;
    parent: Span | null;
    name: string;
    system: string;
    prompt: string;
    fallback: string;
    maxTokens?: number;
    // Longest the model may take once its turn starts. Past that the built-in text is used.
    timeoutMs?: number;
  }): Promise<{ text: string; narrated: boolean }> {
    if (!this.llmOn) return { text: opts.fallback, narrated: false };
    const span = this.startSpan("llm", opts.name, opts.agent, opts.parent, { provider: "ollama", mode: "narration" });
    const thought = await think({ system: opts.system, prompt: opts.prompt, maxTokens: opts.maxTokens, timeoutMs: opts.timeoutMs ?? 20_000 });
    if (!thought) {
      this.endSpan(span, "fallback", { attrs: { reason: "model unavailable or too slow" } });
      this.log(opts.agent, "warn", `${MODEL} took longer than ${Math.round((opts.timeoutMs ?? 20_000) / 1000)} s, so the built-in wording was used`);
      return { text: opts.fallback, narrated: false };
    }
    const usd = llmCost(thought.tokensIn, thought.tokensOut);
    this.cost.llmCalls += 1;
    this.cost.tokensIn += thought.tokensIn;
    this.cost.tokensOut += thought.tokensOut;
    this.cost.llmUsd += usd;
    this.endSpan(span, "ok", {
      tokensIn: thought.tokensIn,
      tokensOut: thought.tokensOut,
      costUsd: usd,
      attrs: { latencyMs: thought.ms, prompt: brief(opts.prompt, 400), output: brief(thought.text, 400) },
    });
    this.pushCost();
    return { text: thought.text, narrated: true };
  }

  // Starts a narration without blocking the agents. The run waits for it before it ends.
  narrateInBackground(opts: Parameters<RunContext["narrate"]>[0], onDone: (text: string, narrated: boolean) => void) {
    const task = this.narrate(opts).then((r) => onDone(r.text, r.narrated));
    this.pending.push(task);
    return task;
  }
}

export { brief };
