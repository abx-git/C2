"use client";

import { useEffect, useState } from "react";
import { EditorShell } from "@/components/editor/editor-shell";
import { HttpGallery } from "@/components/gallery/http-gallery";
import { editorIsHome } from "@/lib/entry";

export default function HomePage() {
  const [editor, setEditor] = useState(process.env.NODE_ENV === "development");

  useEffect(() => {
    setEditor(editorIsHome());
  }, []);

  if (editor) return <EditorShell />;
  return (
    <div className="h-full">
      <HttpGallery />
    </div>
  );
}
