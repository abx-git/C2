"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BRAVE_FS_HELP, isBrave } from "@/lib/browser";
import { toPublicCatalog, catalogViewMode, type Photo } from "@/lib/catalog";
import { supportsDirectoryPicker } from "@/lib/workspace";
import { useEditorStore, type EditorTab } from "@/store/editor-store";
import { GalleryApp } from "@/components/gallery/gallery-app";
import { RoadtripApp } from "@/components/gallery/roadtrip-app";
import { DeployButton } from "./deploy-button";
import { MetadataPanel } from "./metadata-panel";
import { PhotoLibrary } from "./photo-library";
import { SiteTreeEditor } from "./site-tree-editor";
import { TagManager } from "./tag-manager";

const TABS: { id: EditorTab; label: string }[] = [
  { id: "photos", label: "Bilder" },
  { id: "tags", label: "Tags" },
  { id: "site", label: "Struktur" },
  { id: "preview", label: "Vorschau" },
];

export function EditorShell() {
  const restoreWorkspace = useEditorStore((s) => s.restoreWorkspace);
  const connectWorkspace = useEditorStore((s) => s.connectWorkspace);
  const reauthorizeWorkspace = useEditorStore((s) => s.reauthorizeWorkspace);
  const saveCatalog = useEditorStore((s) => s.saveCatalog);
  const saveProjectAs = useEditorStore((s) => s.saveProjectAs);
  const status = useEditorStore((s) => s.status);
  const restoring = useEditorStore((s) => s.restoring);
  const needsGesture = useEditorStore((s) => s.needsGesture);
  const workspaceLabel = useEditorStore((s) => s.workspaceLabel);
  const tab = useEditorStore((s) => s.tab);
  const setTab = useEditorStore((s) => s.setTab);
  const activeTab: EditorTab = TABS.some((item) => item.id === tab) ? tab : "site";
  const dirty = useEditorStore((s) => s.dirty);
  const galleryPassword = useEditorStore((s) => s.galleryPassword);
  const message = useEditorStore((s) => s.message);
  const error = useEditorStore((s) => s.error);
  const catalog = useEditorStore((s) => s.catalog);
  const publicCatalog = useMemo(() => toPublicCatalog(catalog), [catalog]);
  const previewPhotoId = useEditorStore((s) => s.previewPhotoId);
  const thumbUrls = useEditorStore((s) => s.thumbUrls);
  const displayUrls = useEditorStore((s) => s.displayUrls);
  const canUndo = useEditorStore((s) => s.canUndo);
  const canRedo = useEditorStore((s) => s.canRedo);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const undoShortcut = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘Z" : "Strg+Z";
  const redoShortcut = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⇧⌘Z" : "Strg+Y";

  useEffect(() => {
    void restoreWorkspace();
  }, [restoreWorkspace]);

  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(() => {
      void saveCatalog();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [dirty, catalog, galleryPassword, saveCatalog]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "o") {
        event.preventDefault();
        void connectWorkspace();
        return;
      }
      if (status !== "ready") return;
      if (key === "s") {
        event.preventDefault();
        if (event.shiftKey) void saveProjectAs();
        else void saveCatalog(true).then(() => useEditorStore.setState({ message: "Projekt gespeichert." }));
        return;
      }
      if (key !== "z" && key !== "y") return;
      event.preventDefault();
      if (key === "y" || (key === "z" && event.shiftKey)) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [connectWorkspace, redo, saveCatalog, saveProjectAs, status, undo]);

  useEffect(() => {
    if (activeTab !== "preview" || status !== "ready") return;
    const ids = publicCatalog.photos.photos.map((photo) => photo.id);
    void useEditorStore.getState().ensureDisplayUrls(ids);
  }, [activeTab, status, publicCatalog.photos.photos]);

  const resolveUrl = (photo: Photo, kind: "thumb" | "display") => {
    if (kind === "thumb") return thumbUrls[photo.id] ?? "";
    return displayUrls[photo.id] ?? thumbUrls[photo.id] ?? "";
  };

  return (
    <div className="flex h-full max-h-full flex-col overflow-hidden">
      <header className="relative z-20 flex shrink-0 items-center gap-4 border-b border-[var(--edit-line)] bg-[var(--edit-panel)] px-4 py-2">
        <Link href="/" className="text-sm font-medium tracking-wide">
          C2
        </Link>
        <nav className="flex items-center gap-0.5">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`edit-tab ${activeTab === item.id ? "is-active" : ""}`}
              onClick={() => {
                if (status !== "ready") {
                  useEditorStore.setState({
                    message: "Zuerst ein Projekt öffnen.",
                  });
                  return;
                }
                setTab(item.id);
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            className="edit-btn"
            disabled={status !== "ready" || !canUndo}
            title={`Rückgängig (${undoShortcut})`}
            onClick={() => undo()}
          >
            Rückgängig
          </button>
          <button
            type="button"
            className="edit-btn"
            disabled={status !== "ready" || !canRedo}
            title={`Wiederholen (${redoShortcut})`}
            onClick={() => redo()}
          >
            Wiederholen
          </button>
          <DeployButton />
        </div>
      </header>

      <main className="relative z-10 flex min-h-0 flex-1 flex-col p-4">
        {error ? (
          <pre className="mb-3 whitespace-pre-wrap rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900">
            {error}
          </pre>
        ) : null}
        {message ? <p className="mb-3 text-sm text-[var(--edit-muted)]">{message}</p> : null}

        {restoring && status !== "ready" && !needsGesture ? (
          <p className="mb-3 text-sm text-[var(--edit-muted)]">
            {workspaceLabel ? `Projekt „${workspaceLabel}“ wird gelesen…` : "Projekt wird gelesen…"}
          </p>
        ) : null}
        {needsGesture ? (
          <ConnectCard
            title="Projekt erneut verbinden"
            body={`Zugriff auf „${workspaceLabel ?? "Ordner"}“ bestätigen. Falls ein Dialog geöffnet ist, liegt er möglicherweise hinter diesem Fenster.`}
            action="Zugriff erlauben"
            onAction={() => void reauthorizeWorkspace()}
          />
        ) : restoring && status !== "ready" ? (
          <p className="mx-auto mt-16 max-w-lg text-sm text-[var(--edit-muted)]">
            Katalog und Bilder werden geladen. Die Bibliothek erscheint, sobald die JSON-Dateien gelesen sind.
          </p>
        ) : status !== "ready" ? (
          <ConnectCard
            title="Projekt öffnen"
            body="Katalog, Originale und Server-Verbindung liegen in diesem Ordner. Nichts geht auf den Server, bis Sie einen Deploy-Ordner erzeugen."
            action="Projekt öffnen"
            onAction={() => void connectWorkspace()}
          />
        ) : activeTab === "photos" ? (
          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <PhotoLibrary />
            <div className="min-h-0 overflow-auto">
              {previewPhotoId ? null : <MetadataPanel />}
            </div>
          </div>
        ) : activeTab === "tags" ? (
          <div className="min-h-0 flex-1 overflow-auto">
            <TagManager />
          </div>
        ) : activeTab === "site" ? (
          <div className="min-h-0 flex-1 overflow-auto">
            <SiteTreeEditor />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--edit-line)]">
            <div className="min-h-0 flex-1 overflow-hidden">
              {catalogViewMode(publicCatalog) === "roadtrip" ? (
                <RoadtripApp className="h-full" catalog={publicCatalog} resolveUrl={resolveUrl} />
              ) : (
                <GalleryApp className="h-full" catalog={publicCatalog} resolveUrl={resolveUrl} />
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function ConnectCard({
  title,
  body,
  action,
  onAction,
}: {
  title: string;
  body: string;
  action: string;
  onAction: () => void;
}) {
  const [fsHint, setFsHint] = useState<string | null>(null);

  useEffect(() => {
    if (supportsDirectoryPicker()) {
      setFsHint(null);
      return;
    }
    void isBrave().then((brave) => {
      setFsHint(
        brave
          ? BRAVE_FS_HELP
          : "Ordnerzugriff ist in diesem Fenster nicht verfügbar. Brave, Chrome oder Edge verwenden und die Seite direkt öffnen.",
      );
    });
  }, []);

  return (
    <div className="mx-auto mt-16 max-w-lg rounded-2xl border border-[var(--edit-line)] bg-[var(--edit-panel)] p-8">
      <h1 className="mb-2 text-lg font-medium">{title}</h1>
      <p className="mb-6 text-sm leading-relaxed text-[var(--edit-muted)]">{body}</p>
      {fsHint ? (
        <pre className="mb-6 whitespace-pre-wrap rounded-lg border border-[var(--edit-line)] bg-white px-3 py-3 text-xs leading-relaxed text-[var(--edit-ink)]">
          {fsHint}
        </pre>
      ) : null}
      <button type="button" className="edit-btn-primary edit-btn" onClick={onAction}>
        {action}
      </button>
    </div>
  );
}
