import { store } from "@/lib/engine/store";
import { connection } from "next/server";

export async function GET(_request: Request, ctx: RouteContext<"/api/runs/[id]">) {
  await connection();
  const { id } = await ctx.params;
  const run = store.get(id);
  if (!run) return Response.json({ error: "Run not found. It may have been pruned or the server restarted." }, { status: 404 });
  return Response.json(run);
}
