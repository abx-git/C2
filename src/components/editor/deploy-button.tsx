"use client";

import { useEffect, useState } from "react";
import { appBase } from "@/lib/app-base";
import { describeSync, fetchSyncStatus, runSyncTransfer, type SyncStatus } from "@/lib/c2-sync";
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
  const [progress, setProgress] = useState<{ current: number; total: number; skipped: number } | null>(null);
  const [sync, setSync] = useState<SyncStatus | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const refresh = async (probe = false) => {
      const next = await fetchSyncStatus(probe);
      if (!cancelled) setSync(next);
    };
    void refresh(false);
    const timer = window.setInterval(() => void refresh(false), 6000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  if (status !== "ready") return null;

  const busyLabel =
    progress && progress.total
      ? `Schreibe ${progress.current}/${progress.total}…`
      : "Schreibe…";
  const syncView = sync === undefined ? null : describeSync(sync);
  const syncReady = Boolean(sync?.configured && sync.deployExists && sync.reachable !== false);

  const runDeploy = async (mode: "gallery" | "roadtrip") => {
    setInfo(null);
    setProgress(null);
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
        password: useEditorStore.getState().galleryPassword,
        mode,
        onProgress: setProgress,
      });
      const appNote = result.copiedApp
        ? mode === "roadtrip"
          ? "Roadtrip-Ordner: Bildstrom per Pfeiltasten, OpenStreetMap wenn GPS vorhanden."
          : "Eigenständiger Ordner: index.html im Finder öffnen, JSON und veröffentlichte Bilder."
        : "Nur JSON und Bilder geschrieben. Einmal „npm run build:static“ ausführen, dann erneut deployen — erst dann ist der Ordner allein auslieferbar.";
      const protectNote = [
        result.watermarked ? "Wasserzeichen gesetzt." : null,
        result.encrypted ? "Bilder verschlüsselt." : null,
      ]
        .filter(Boolean)
        .join(" ");
      const skipNote = result.skipped ? ` ${result.skipped} unverändert übersprungen.` : "";
      const mapNote =
        mode === "roadtrip"
          ? result.geoCount
            ? ` Karte mit ${result.geoCount} GPS-Punkt${result.geoCount === 1 ? "" : "en"}.`
            : " Keine GPS-Daten in den Bildern — Karte bleibt ausgeblendet."
          : "";
      setInfo(
        `${appNote} ${result.photoCount} Bild${result.photoCount === 1 ? "" : "er"}.${mapNote}${protectNote ? ` ${protectNote}` : ""}${skipNote}${
          mode === "gallery" && syncReady
            ? " Danach „Zum Server“."
            : mode === "gallery"
              ? " Server-Sync ist noch nicht bereit — Setup prüfen."
              : ""
        }`,
      );
    } catch (err) {
      setInfo(err instanceof Error ? err.message : "Deploy fehlgeschlagen");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="edit-btn-primary edit-btn"
        disabled={busy}
        onClick={() => void runDeploy("gallery")}
      >
        {busy ? busyLabel : "Deploy-Ordner"}
      </button>
      <button
        type="button"
        className="edit-btn"
        disabled={busy}
        onClick={() => void runDeploy("roadtrip")}
      >
        {busy ? busyLabel : "Roadtrip-Ordner"}
      </button>
      <button
        type="button"
        className="edit-btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setInfo("Prüfe Server-Verbindung…");
          try {
            const live = await fetchSyncStatus(true);
            setSync(live);
            const view = describeSync(live);
            if (!live || !live.configured) {
              setInfo(view.label);
              return;
            }
            if (!live.deployExists) {
              setInfo(view.label);
              return;
            }
            if (live.reachable === false) {
              setInfo(view.label);
              return;
            }
            setInfo("Übertrage auf den Server…");
            const result = await runSyncTransfer();
            const after = await fetchSyncStatus(false);
            setSync(after);
            setInfo(result.ok ? "Galerie ist auf dem Server." : result.error);
          } finally {
            setBusy(false);
          }
        }}
      >
        Zum Server
      </button>
      <button
        type="button"
        className="edit-btn"
        disabled={busy}
        onClick={() => {
          setInfo(
            "Einmalig Setup doppelklicken: Mac scripts/c2-sync/setup.command, Windows scripts/c2-sync/setup.cmd. Danach bleibt der Sync-Status hier sichtbar.",
          );
        }}
      >
        Sync einrichten
      </button>
      {syncView ? (
        <span
          role="status"
          className={`max-w-lg text-xs ${
            syncView.tone === "err"
              ? "text-red-800"
              : syncView.tone === "warn"
                ? "text-amber-800"
                : "text-[var(--edit-muted)]"
          }`}
        >
          {syncView.label}
        </span>
      ) : null}
      {info ? <span className="max-w-md text-xs text-[var(--edit-muted)]">{info}</span> : null}
      {!supportsDirectoryPicker() ? (
        <span className="text-xs text-[var(--edit-muted)]">Chrome oder Edge nötig</span>
      ) : null}
    </div>
  );
}
