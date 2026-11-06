import { checkHead } from "@/lib/head";

// A route handler, not a server action: Next dispatches server actions one at
// a time and queues router.refresh() behind them, so a list of rows each
// asking GitHub held up org switches and the refresh into a finished map.
// Plain GETs run side by side and never touch the router.
export async function GET(_req: Request, ctx: RouteContext<"/analyses/[id]/head">) {
  const { id } = await ctx.params;
  return Response.json(await checkHead(id));
}
