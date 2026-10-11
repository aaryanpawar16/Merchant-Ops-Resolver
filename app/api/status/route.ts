import { ollamaStatus, warmIfStale } from "@/lib/engine/ollama";
import { connection } from "next/server";

// Reports whether the local model is reachable, and loads it into memory if it may have gone cold.
// The console calls this when it opens, so the model is ready by the time someone presses Run.
export async function GET() {
  await connection();
  const status = await ollamaStatus();
  if (status.available) warmIfStale();
  return Response.json(status);
}
