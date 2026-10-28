"use client";

import { useEffect, useRef, useState } from "react";
import { SyncSetupDialog } from "@/components/editor/sync-setup-dialog";
import { appBase } from "@/lib/app-base";
import {
  describeSync,
  fetchSyncStatus,
  formatUploadResultMessage,
  rememberDeployDirectory,
  runSyncTransfer,
  type SyncStatus,
} from "@/lib/c2-sync";
import { hasNativeSync } from "@/lib/c2-sync-native";
import { writeDeployFolder } from "@/lib/deploy";
import { ensureProjectDeployDir, projectDeployHasSite } from "@/lib/project-deploy";
import { publicSiteLink } from "@/lib/publish-url";
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
  const [setupOpen, setSetupOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; skipped: number } | null>(null);
  const [sync, setSync] = useState<SyncStatus | null | undefined>(undefined);
  const [localDeployReady, setLocalDeployReady] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const native = hasNativeSync();
  const projectFolder = workspaceLabel ?? "";

  useEffect(() => {
    let cancelled = false;
    const refresh = async (probe = false) => {
      const next = await fetchSyncStatus(probe, publishPath, projectFolder);
      if (!cancelled) setSync(next);
    };
    void refresh(false);
    const timer = window.setInterval(() => void refresh(false), 6000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [publishPath, projectFolder]);

  useEffect(() => {
    let cancelled = false;
    const handle = getWorkspaceHandle();
    if (!handle || status !== "ready") {
      setLocalDeployReady(false);
      return;
    }
    void projectDeployHasSite(handle).then((ready) => {
      if (!cancelled) setLocalDeployReady(ready);
    });
    return () => {
      cancelled = true;
    };
  }, [getWorkspaceHandle, status, catalog, busy]);

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

  const refreshSync = async (probe = false) => {
    const next = await fetchSyncStatus(probe, publishPath, projectFolder);
    setSync(next);
    return next;
  };

  if (status !== "ready") {
    return (
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        <button type="button" className="edit-btn edit-btn-primary" onClick={() => void connectWorkspace({ intent: "new" })}>
          Neues Projekt
        </button>
        <button type="button" className="edit-btn" onClick={() => void connectWorkspace({ intent: "open" })}>
          Öffnen
        </button>
      </div>
    );
  }

  const busyLabel =
    progress && progress.total ? `Veröffentliche ${progress.current}/${progress.total}…` : "Veröffentliche…";
  const syncView = sync === undefined ? null : describeSync(sync, projectSync, publishPath, localDeployReady);
  const syncBad = syncView?.tone === "err";
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);
  const saveShortcut = mac ? "⌘S" : "Strg+S";
  const saveAsShortcut = mac ? "⇧⌘S" : "Strg+Umschalt+S";
  const openShortcut = mac ? "⌘O" : "Strg+O";
  const remoteBase = projectSync.remote || sync?.remote || "likibox";

  const runPublish = async () => {
    setOpen(false);
    const workspace = getWorkspaceHandle();
    if (!workspace) {
      setMessage("Kein Projekt geöffnet.");
      return;
    }
    setBusy(true);
    setProgress(null);
    try {
      setMessage("Schritt 1/2: Website wird in deploy/ gebaut …");
      await saveCatalog(true);
      const dest = await ensureProjectDeployDir(workspace);
      const result = await writeDeployFolder({
        dest,
        catalog,
        workspace,
        originBase: appBase(),
        password: useEditorStore.getState().galleryPassword,
        onProgress: setProgress,
      });
      await rememberDeployDirectory(dest);
      setLocalDeployReady(true);
      setSync(await fetchSyncStatus(false, publishPath, projectFolder));

      if (!result.copiedApp) {
        setMessage(
          "Website in deploy/ geschrieben, aber App-Dateien fehlen. Einmal „npm run build:static“ im C2-Ordner, dann erneut veröffentlichen.",
        );
        return;
      }

      const link = publicSiteLink(catalog.site, remoteBase);
      const buildNote = `deploy/ im Projekt: ${result.photoCount} Medien · ${result.mode === "roadtrip" ? "Roadtrip" : "Galerie"}.`;

      setMessage("Schritt 2/2: Upload zum Server …");
      const live = await fetchSyncStatus(true, publishPath, projectFolder);
      setSync(live);

      if (native && live && !live.configured) {
        setMessage(`${buildNote} Upload: bitte „Sync einrichten“. ${link.hint}`);
        setSetupOpen(true);
        return;
      }

      if (!native && live && !live.configured) {
        setMessage(
          `${buildNote} Upload: Sync-Helfer fehlt (setup.command). Website liegt lokal in deploy/. ${link.hint}`,
        );
        return;
      }

      if (live?.reachable === false) {
        setMessage(`${buildNote} Server nicht erreichbar — Upload später erneut. ${link.hint}`);
        return;
      }

      const upload = await runSyncTransfer(publishPath, projectSync, projectFolder);
      setSync(await fetchSyncStatus(false, publishPath, projectFolder));

      if (!upload.ok) {
        setMessage(`${buildNote} Upload fehlgeschlagen: ${upload.error}`);
        return;
      }

      const uploadMsg = formatUploadResultMessage(upload.ok, upload.error, upload.via, link.hint);
      setMessage(`${buildNote} ${uploadMsg}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Veröffentlichen fehlgeschlagen.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <>
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
            <button type="button" role="menuitem" disabled={busy} className="edit-menu-primary" onClick={() => void runPublish()}>
              Veröffentlichen
            </button>
            <p className="edit-menu-note">
              Baut die Website nach <strong>deploy/</strong> im Projekt und lädt sie hoch. Server-Unterordner: Struktur →
              „Unterordner auf dem Server“.
            </p>
            <div className="edit-menu-sep" />
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
            {syncView ? <p className="edit-menu-note">{syncView.label}</p> : null}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                if (native) {
                  setSetupOpen(true);
                  return;
                }
                setMessage("Einmal setup.command (Mac) bzw. setup.cmd (Windows) — danach reicht „Veröffentlichen“.");
              }}
            >
              Sync einrichten
            </button>
          </div>
        ) : null}
      </div>
      {native ? (
        <SyncSetupDialog
          open={setupOpen}
          onClose={() => setSetupOpen(false)}
          onSaved={() => {
            void refreshSync(true).then(() => setMessage("Sync gespeichert. Jetzt „Veröffentlichen“."));
          }}
        />
      ) : null}
    </>
  );
}
