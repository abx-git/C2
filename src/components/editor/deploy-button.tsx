"use client";

import { useState } from "react";
import { appBase } from "@/lib/app-base";
import { writeDeployFolder } from "@/lib/deploy";
import { pickDirectory, supportsDirectoryPicker } from "@/lib/workspace";
import { useEditorStore } from "@/store/editor-store";

export function DeployButton() {
  const status = useEditorStore((s) => s.status);
  const catalog = useEditorStore((s) => s.catalog);
  const getWorkspaceHandle = useEditorStore((s) => s.getWorkspaceHandle);
  const saveCatalog = useEditorStore((s) => s.saveCatalog);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  if (status !== "ready") return null;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="edit-btn-primary edit-btn"
        disabled={busy}
        onClick={async () => {
          setInfo(null);
          const dest = await pickDirectory("readwrite");
          if (!dest) return;
          const workspace = getWorkspaceHandle();
          if (!workspace) {
            setInfo("Kein Workspace verbunden.");
            return;
          }
          setBusy(true);
          try {
            await saveCatalog();
            const originBase = appBase();
            const result = await writeDeployFolder({
              dest,
              catalog,
              workspace,
              originBase,
            });
            const appNote = result.copiedApp
              ? "Eigenständiger Ordner: App, JSON und veröffentlichte Bilder."
              : "Nur JSON und Bilder geschrieben. Einmal „npm run build:static“ ausführen, dann erneut deployen — erst dann ist der Ordner allein auslieferbar.";
            setInfo(`${appNote} ${result.photoCount} Bild${result.photoCount === 1 ? "" : "er"}.`);
          } catch (err) {
            setInfo(err instanceof Error ? err.message : "Deploy fehlgeschlagen");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Schreibe…" : "Deploy-Ordner"}
      </button>
      {info ? <span className="max-w-md text-xs text-[var(--edit-muted)]">{info}</span> : null}
      {!supportsDirectoryPicker() ? (
        <span className="text-xs text-[var(--edit-muted)]">Chrome oder Edge nötig</span>
      ) : null}
    </div>
  );
}
