"use client";

import { useEffect } from "react";
import { EditorShell } from "@/components/editor/editor-shell";
import { editorIsHome } from "@/lib/entry";

export default function EditPage() {
  useEffect(() => {
    if (!editorIsHome()) return;
    const path = window.location.pathname.replace(/\/+$/, "");
    if (!path.endsWith("/edit")) return;
    const parent = path.slice(0, -"/edit".length);
    window.history.replaceState(null, "", parent ? `${parent}/` : "/");
  }, []);
  return <EditorShell />;
}
