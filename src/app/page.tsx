"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { EditorShell } from "@/components/editor/editor-shell";
import { HttpGallery } from "@/components/gallery/http-gallery";
import { editorIsHome } from "@/lib/entry";

function initialEditorMode(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  if (typeof window !== "undefined" && Capacitor.isNativePlatform()) return true;
  return false;
}

export default function HomePage() {
  const [editor, setEditor] = useState(initialEditorMode);

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
