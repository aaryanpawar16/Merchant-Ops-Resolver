import { batchStore } from "@/lib/engine/batch";
import { connection } from "next/server";

export async function GET(_request: Request, ctx: RouteContext<"/api/batches/[id]">) {
  await connection();
  const { id } = await ctx.params;
  const batch = batchStore.get(id);
  if (!batch) return Response.json({ error: "Batch not found. It may have been pruned or the server restarted." }, { status: 404 });
  return Response.json(batch);
}
