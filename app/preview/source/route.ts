import type { NextRequest } from "next/server";
import { readPreviewSource } from "@/lib/preview-fixture";

// One file's text for the code preview. Fetched on selection rather than
// shipped with the page, since it is most of a megabyte nobody reads all of.
export function GET(request: NextRequest) {
  const file = request.nextUrl.searchParams.get("path");
  const text = file === null ? null : readPreviewSource(file);
  if (text === null) return new Response("No source for that path in the preview fixture.", { status: 404 });
  return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
