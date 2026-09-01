"use client";

import { useEffect, useRef, useState } from "react";
import { appBase } from "@/lib/app-base";
import { normalizePublishPath } from "@/lib/catalog";
import { describeSync, fetchSyncStatus, runSyncTransfer, type SyncStatus } from "@/lib/c2-sync";
import { writeDeployFolder } from "@/lib/deploy";
import { pickDirectory, supportsDirectoryPicker } from "@/lib/workspace";
import { useEditorStore } from "@/store/editor-store";

export function DeployButton() {
  const status = useEditorStore((s) => s.status);
  const catalog = useEditorStore((s) => s.catalog);
  const projectSync = useEditorStore((s) => s.projectSync);
  const getWorkspaceHandle = useEditorStore((s) => s.getWorkspaceHandle);
  const saveCatalog = useEditorStore((s) => s.saveCatalog);
  const saveProjectAs = useEditorStore((s) => s.saveProjectAs);
  const connectWorkspace = useEditorStore((s) => s.connectWorkspace);
  const disconnect = useEditorStore((s) => s.disconnect);
  const workspaceLabel = useEditorStore((s) => s.workspaceLabel);
  const dirty = useEditorStore((s) => s.dirty);
  const publishPath = catalog.site.publishPath ?? "";
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; skipped: number } | null>(null);
  const [sync, setSync] = useState<SyncStatus | null | undefined>(undefined);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = async (probe = false) => {
      const next = await fetchSyncStatus(probe, publishPath);
      if (!cancelled) setSync(next);
    };
    void refresh(false);
    const timer = window.setInterval(() => void refresh(false), 6000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [publishPath]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const setMessage = (text: string | null) => {
    useEditorStore.setState({ message: text });
  };

  if (status !== "ready") {
    return (
      <button type="button" className="edit-btn" onClick={() => void connectWorkspace()}>
        Projekt öffnen
      </button>
    );
  }

  const busyLabel =
    progress && progress.total ? `Schreibe ${progress.current}/${progress.total}…` : "Schreibe…";
  const syncView = sync === undefined ? null : describeSync(sync, projectSync, publishPath);
  const syncReady = Boolean(sync?.configured && sync.deployExists && sync.reachable !== false);
  const syncBad = syncView?.tone === "err";
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);
  const saveShortcut = mac ? "⌘S" : "Strg+S";
  const saveAsShortcut = mac ? "⇧⌘S" : "Strg+Umschalt+S";
  const openShortcut = mac ? "⌘O" : "Strg+O";

  const runDeploy = async () => {
    setOpen(false);
    setProgress(null);
    const dest = await pickDirectory("readwrite");
    if (!dest) return;
    const workspace = getWorkspaceHandle();
    if (!workspace) {
      setMessage("Kein Projekt geöffnet.");
      return;
    }
    setBusy(true);
    try {
      await saveCatalog(true);
      const result = await writeDeployFolder({
        dest,
        catalog,
        workspace,
        originBase: appBase(),
        password: useEditorStore.getState().galleryPassword,
        onProgress: setProgress,
      });
      const appNote = result.copiedApp
        ? "Deploy-Ordner geschrieben."
        : "Nur JSON und Bilder geschrieben. Einmal „npm run build:static“, dann erneut deployen.";
      const extra = [
        result.mode === "roadtrip" ? "Roadtrip" : "Galerie",
        `${result.photoCount} Bild${result.photoCount === 1 ? "" : "er"}`,
        result.geoCount ? `${result.geoCount} GPS-Punkte` : null,
        result.watermarked ? "Wasserzeichen" : null,
        result.encrypted ? "verschlüsselt" : null,
        result.skipped ? `${result.skipped} unverändert` : null,
        result.publishPath ? `unter /${result.publishPath}/` : null,
        result.folderName ? `Ordner ${result.folderName}` : null,
        syncReady ? "Danach „Zum Server“." : null,
      ]
        .filter(Boolean)
        .join(" · ");
      setMessage(`${appNote} ${extra}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Deploy fehlgeschlagen");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const runServer = async () => {
    setOpen(false);
    setBusy(true);
    setMessage("Prüfe Server-Verbindung…");
    try {
      const live = await fetchSyncStatus(true, publishPath);
      setSync(live);
      const view = describeSync(live, projectSync, publishPath);
      if (!live || !live.configured || !live.deployExists || live.reachable === false) {
        setMessage(view.label);
        return;
      }
      setMessage("Übertrage auf den Server…");
      const result = await runSyncTransfer(publishPath, projectSync);
      setSync(await fetchSyncStatus(false, publishPath));
      const slug = normalizePublishPath(publishPath);
      setMessage(
        result.ok
          ? slug
            ? `Galerie ist auf dem Server unter /${slug}/.`
            : "Galerie ist auf dem Server."
          : result.error,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="edit-menu" ref={rootRef}>
      <button
        type="button"
        className="edit-menu-trigger"
        disabled={busy}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="max-w-[10rem] truncate">{busy ? busyLabel : workspaceLabel || "Projekt"}</span>
        {dirty && !busy ? <span className="edit-menu-dot" title="Ungespeichert" /> : null}
        {syncBad && !busy ? <span className="edit-menu-dot is-err" title={syncView?.label} /> : null}
        <span aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div className="edit-menu-panel" role="menu">
          <button
            type="button"
            role="menuitem"
            title={openShortcut}
            onClick={() => {
              setOpen(false);
              void connectWorkspace();
            }}
          >
            Projekt öffnen
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            title={saveShortcut}
            onClick={() => {
              setOpen(false);
              void saveCatalog(true).then(() => setMessage("Projekt gespeichert."));
            }}
          >
            Speichern
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            title={saveAsShortcut}
            onClick={() => {
              setOpen(false);
              void saveProjectAs();
            }}
          >
            Speichern unter
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              disconnect();
            }}
          >
            Trennen
          </button>
          <div className="edit-menu-sep" />
          <button type="button" role="menuitem" disabled={busy} onClick={() => void runDeploy()}>
            Deploy-Ordner
          </button>
          <button type="button" role="menuitem" disabled={busy} onClick={() => void runServer()}>
            Zum Server
          </button>
          <div className="edit-menu-sep" />
          {syncView ? <p className="edit-menu-note">{syncView.label}</p> : null}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setMessage(
                "Der Helfer startet nach dem Anmelden selbst. Nur wenn er fehlt: einmal setup.command (Mac) bzw. setup.cmd (Windows).",
              );
            }}
          >
            Sync einrichten
          </button>
          {!supportsDirectoryPicker() ? <p className="edit-menu-note">Chrome oder Edge nötig.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
