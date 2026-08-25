"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BRAVE_FS_HELP, isBrave } from "@/lib/browser";
import { toPublicCatalog, type Photo } from "@/lib/catalog";
import { supportsDirectoryPicker } from "@/lib/workspace";
import { useEditorStore, type EditorTab } from "@/store/editor-store";
import { GalleryApp } from "@/components/gallery/gallery-app";
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
  const disconnect = useEditorStore((s) => s.disconnect);
  const saveCatalog = useEditorStore((s) => s.saveCatalog);
  const status = useEditorStore((s) => s.status);
  const restoring = useEditorStore((s) => s.restoring);
  const needsGesture = useEditorStore((s) => s.needsGesture);
  const workspaceLabel = useEditorStore((s) => s.workspaceLabel);
  const tab = useEditorStore((s) => s.tab);
  const setTab = useEditorStore((s) => s.setTab);
  const dirty = useEditorStore((s) => s.dirty);
  const galleryPassword = useEditorStore((s) => s.galleryPassword);
  const message = useEditorStore((s) => s.message);
  const error = useEditorStore((s) => s.error);
  const catalog = useEditorStore((s) => s.catalog);
  const thumbUrls = useEditorStore((s) => s.thumbUrls);
  const displayUrls = useEditorStore((s) => s.displayUrls);

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
    if (tab !== "preview" || status !== "ready") return;
    const ids = toPublicCatalog(useEditorStore.getState().catalog).photos.photos.map((photo) => photo.id);
    void useEditorStore.getState().ensureDisplayUrls(ids);
  }, [tab, status]);

  const resolveUrl = (photo: Photo, kind: "thumb" | "display") => {
    if (kind === "thumb") return thumbUrls[photo.id] ?? "";
    return displayUrls[photo.id] ?? thumbUrls[photo.id] ?? "";
  };

  return (
    <div className="flex h-full max-h-full flex-col overflow-hidden">
      <header className="relative z-20 flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--edit-line)] bg-[var(--edit-panel)] px-4 py-3">
        <Link href="/" className="text-sm font-semibold tracking-wide">
          C2
        </Link>
        <span className="text-xs text-[var(--edit-muted)]">Edit</span>
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`edit-btn ${tab === item.id ? "edit-btn-primary" : ""}`}
            onClick={() => {
              if (status !== "ready") {
                useEditorStore.setState({
                  message: "Zuerst einen Workspace-Ordner öffnen.",
                });
                return;
              }
              setTab(item.id);
            }}
          >
            {item.label}
          </button>
        ))}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {workspaceLabel ? (
            <span className="text-xs text-[var(--edit-muted)]">
              {workspaceLabel}
              {dirty ? " · ungespeichert" : ""}
            </span>
          ) : null}
          {status === "ready" ? (
            <>
              <button type="button" className="edit-btn" onClick={() => void connectWorkspace()}>
                Anderen Ordner
              </button>
              <button type="button" className="edit-btn" onClick={disconnect}>
                Trennen
              </button>
            </>
          ) : (
            <button type="button" className="edit-btn-primary edit-btn" onClick={() => void connectWorkspace()}>
              Workspace öffnen
            </button>
          )}
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
            {workspaceLabel ? `Workspace „${workspaceLabel}“ wird gelesen…` : "Workspace wird gelesen…"}
          </p>
        ) : null}
        {needsGesture ? (
          <ConnectCard
            title="Workspace erneut verbinden"
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
            title="Workspace-Ordner wählen"
            body="Alle Originale, heruntergerechneten Bilder und JSON-Dateien bleiben in diesem Ordner. Nichts wird auf einen Server übertragen, bis Sie einen Deploy-Ordner erzeugen."
            action="Ordner öffnen"
            onAction={() => void connectWorkspace()}
          />
        ) : tab === "photos" ? (
          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <PhotoLibrary />
            <div className="min-h-0 overflow-auto">
              <MetadataPanel />
            </div>
          </div>
        ) : tab === "tags" ? (
          <div className="min-h-0 flex-1 overflow-auto">
            <TagManager />
          </div>
        ) : tab === "site" ? (
          <div className="min-h-0 flex-1 overflow-auto">
            <SiteTreeEditor />
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-[var(--edit-line)]">
            <GalleryApp className="h-full" catalog={toPublicCatalog(catalog)} resolveUrl={resolveUrl} />
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
