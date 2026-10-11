import { executeBatch } from "@/lib/engine/batch";
import { evalStore, type EvalMode } from "@/lib/engine/evalStore";
import { buildEvalSuite } from "@/lib/engine/evalSuite";
import { connection } from "next/server";

export const maxDuration = 300;

// Shares one lock with the batch route, so a scorecard and an upload never run at the same time.
const g = globalThis as unknown as { __batchActive?: boolean };

const MODES: EvalMode[] = ["clean", "timeout", "ambiguous"];

// Runs the built-in labelled benchmark and streams progress like an upload. The result is recorded for comparison.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { mode?: unknown; unsafeRetry?: unknown; label?: unknown; txns?: unknown } | null;
  // Optional: run only these case ids, such as ["80001"], instead of all 42.
  const txns = Array.isArray(body?.txns) ? body.txns.filter((t): t is string => typeof t === "string" && /^\d{5}$/.test(t)).slice(0, 10) : [];
  const mode = MODES.includes(body?.mode as EvalMode) ? (body?.mode as EvalMode) : "clean";
  const label = typeof body?.label === "string" ? body.label : "";
  if (g.__batchActive) return Response.json({ error: "Another batch is running. Try again in a moment." }, { status: 429 });
  g.__batchActive = true;

  const suite = buildEvalSuite(txns);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const stored = await executeBatch(
          {
            text: suite.csv,
            filename: "built-in-benchmark.csv",
            chaos: mode !== "clean",
            ambiguous: mode === "ambiguous",
            unsafeRetry: mode === "ambiguous" && body?.unsafeRetry === true,
            llm: false,
            freshMemory: true,
          },
          (event) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)),
        );
        evalStore.record(stored, mode, label);
      } finally {
        g.__batchActive = false;
        try {
          controller.close();
        } catch {
          // already closed because the client left
        }
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store, no-transform", "x-accel-buffering": "no" },
  });
}

export async function GET() {
  await connection();
  return Response.json({ runs: evalStore.list() });
}
