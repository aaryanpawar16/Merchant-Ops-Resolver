import { executeRun } from "@/lib/engine/run";
import { store } from "@/lib/engine/store";
import { connection } from "next/server";

// A case can take up to about 20 s when a slow local model writes the subject line. Platforms that read
// this setting (such as Vercel) would otherwise cut the stream off at their default limit.
export const maxDuration = 60;

const MAX_CONCURRENT = 3;
const g = globalThis as unknown as { __active?: number };

// Starts a case and streams every event back as server-sent events.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { instruction?: unknown; chaos?: unknown; llm?: unknown; speed?: unknown } | null;
  const instruction = typeof body?.instruction === "string" ? body.instruction.trim() : "";
  if (instruction.length < 3 || instruction.length > 400) {
    return Response.json({ error: "Instruction must be between 3 and 400 characters." }, { status: 400 });
  }
  if ((g.__active ?? 0) >= MAX_CONCURRENT) {
    return Response.json({ error: "Too many cases running. Try again in a few seconds." }, { status: 429 });
  }

  const speed = typeof body?.speed === "number" ? Math.min(Math.max(body.speed, 0), 1) : 1;
  const encoder = new TextEncoder();
  g.__active = (g.__active ?? 0) + 1;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        await executeRun({ instruction, chaos: body?.chaos === true, llm: body?.llm !== false, speed }, (event) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        });
      } finally {
        g.__active = Math.max((g.__active ?? 1) - 1, 0);
        try {
          controller.close();
        } catch {
          // already closed because the client left
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
    },
  });
}

export async function GET() {
  await connection();
  return Response.json({ runs: store.summaries() });
}
