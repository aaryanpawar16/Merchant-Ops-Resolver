import { snapshot } from "@/lib/engine/economics";
import { store } from "@/lib/engine/store";
import { connection } from "next/server";

export async function GET() {
  await connection();
  return Response.json(snapshot(store.summaries()));
}
