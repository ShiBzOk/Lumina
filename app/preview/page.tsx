import type { Metadata } from "next";
import { MapWorkspace } from "@/components/map/map-workspace";
import { readPreviewMeta, readPreviewResult } from "@/lib/preview-fixture";

export const metadata: Metadata = { title: "Preview · Lumina" };

// Renders the checked-in fixture through the real interface. Only what the
// browser needs crosses over: the adapter name, files, edges and the import
// records. Everything the detail pane shows is derived from these.
export default function PreviewPage() {
  const { adapter, files, edges, imports } = readPreviewResult();
  return <MapWorkspace meta={readPreviewMeta()} adapter={adapter} files={files} edges={edges} imports={imports} />;
}
