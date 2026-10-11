import { executeBatch } from "@/lib/engine/batch";
import { buildIntake, IntakeError, MAX_BYTES } from "@/lib/engine/intake";

// A batch of dozens of cases, each with a short simulated wait. Platforms that read this keep the stream open.
export const maxDuration = 300;

const g = globalThis as unknown as { __batchActive?: boolean };

// Uploads a file's text and streams the progress of every case as server-sent events.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { text?: unknown; filename?: unknown; chaos?: unknown; llm?: unknown; freshMemory?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text : "";
  const filename = typeof body?.filename === "string" ? body.filename.slice(0, 120) : "upload.csv";
  if (!text) return Response.json({ error: "No file content was sent." }, { status: 400 });
  if (text.length > MAX_BYTES) return Response.json({ error: "The file is too large." }, { status: 413 });

  // Reject a bad file before opening the stream, so the page can show the reason.
  try {
    buildIntake(text, filename);
  } catch (error) {
    if (error instanceof IntakeError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }

  if (g.__batchActive) return Response.json({ error: "Another batch is running. Try again in a moment." }, { status: 429 });
  g.__batchActive = true;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        await executeBatch(
          { text, filename, chaos: body?.chaos === true, llm: body?.llm === true, freshMemory: body?.freshMemory !== false, ambiguous: false, unsafeRetry: false },
          (event) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)),
        );
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
