import { memory } from "@/lib/engine/checkpoints";
import { connection } from "next/server";

export async function GET() {
  await connection();
  return Response.json({ entries: memory.all() });
}

// ?mode=reset restores the seeded memory, ?mode=clear forgets everything so a cold start can be shown.
export async function DELETE(request: Request) {
  const mode = new URL(request.url).searchParams.get("mode");
  if (mode === "clear") memory.clear();
  else memory.reset();
  return Response.json({ entries: memory.all() });
}
