"use client";

import { EditorShell } from "@/components/editor/editor-shell";
import { HttpGallery } from "@/components/gallery/http-gallery";
import { editorIsHome } from "@/lib/entry";

export default function HomePage() {
  if (editorIsHome()) return <EditorShell />;
  return (
    <div className="h-full">
      <HttpGallery />
    </div>
  );
}
