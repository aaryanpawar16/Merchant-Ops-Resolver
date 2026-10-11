import { toOtlp } from "@/lib/engine/export";
import { store } from "@/lib/engine/store";
import { connection } from "next/server";

// OTLP/JSON export of one run's trace.
export async function GET(_request: Request, ctx: RouteContext<"/api/runs/[id]/trace">) {
  await connection();
  const { id } = await ctx.params;
  const run = store.get(id);
  if (!run) return Response.json({ error: "Run not found." }, { status: 404 });
  return new Response(JSON.stringify(toOtlp(run), null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="${id}.otlp.json"`,
    },
  });
}
