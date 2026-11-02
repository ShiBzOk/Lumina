import type { Metadata } from "next";
import { MapWorkspace } from "@/components/map/map-workspace";
import { readPreviewMeta, readPreviewResult } from "@/lib/preview-fixture";

export const metadata: Metadata = { title: "Preview · Lumina" };

// Renders the checked-in fixture through the real interface. Only what the
// browser needs crosses over: files, edges and the import records.
export default function PreviewPage() {
  const { files, edges, imports } = readPreviewResult();
  return <MapWorkspace meta={readPreviewMeta()} files={files} edges={edges} imports={imports} />;
}
