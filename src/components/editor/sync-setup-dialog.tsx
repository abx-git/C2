"use client";

import { useEffect, useState } from "react";
import { C2Sync, type C2SyncConfig } from "@/lib/c2-sync-native";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export function SyncSetupDialog({ open, onClose, onSaved }: Props) {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const cfg: C2SyncConfig = await C2Sync.getConfig();
        if (cancelled) return;
        setHost(cfg.host || "");
        setPort(String(cfg.port || 22));
        setUser(cfg.user || "");
        setHasPassword(cfg.hasPassword);
        setPassword("");
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Konfiguration lesen fehlgeschlagen");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!host.trim() || !user.trim()) {
        setError("Host und Benutzer sind Pflicht.");
        return;
      }
      if (!password && !hasPassword) {
        setError("Passwort angeben.");
        return;
      }
      const portNum = Number.parseInt(port, 10);
      await C2Sync.saveConfig({
        host: host.trim(),
        port: Number.isFinite(portNum) && portNum > 0 ? portNum : 22,
        user: user.trim(),
        ...(password ? { password } : {}),
        remote: "likibox",
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="edit-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="edit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="c2-sync-setup-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="c2-sync-setup-title">Sync einrichten</h2>
        <p className="edit-menu-note">
          SFTP-Zugang zum Hosting. Die Website wird im Projekt in <strong>deploy/</strong> gebaut — „Veröffentlichen“ lädt
          nach <strong>likibox/</strong> plus optional Unterordner unter Struktur.
        </p>
        <label className="edit-modal-field">
          <span>Host</span>
          <input
            className="edit-field"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            autoComplete="off"
            placeholder="z. B. 123.ssh.w2.strato.hosting"
          />
        </label>
        <label className="edit-modal-field">
          <span>Port</span>
          <input className="edit-field" value={port} onChange={(e) => setPort(e.target.value)} inputMode="numeric" />
        </label>
        <label className="edit-modal-field">
          <span>Benutzer</span>
          <input className="edit-field" value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" />
        </label>
        <label className="edit-modal-field">
          <span>Passwort{hasPassword && !password ? " (gespeichert)" : ""}</span>
          <input
            className="edit-field"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder={hasPassword ? "Unverändert lassen" : ""}
          />
        </label>
        {error ? (
          <p className="edit-menu-note" style={{ color: "#b91c1c" }}>
            {error}
          </p>
        ) : null}
        <div className="edit-modal-actions">
          <button type="button" className="edit-btn" disabled={busy} onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="edit-btn edit-btn-primary" disabled={busy} onClick={() => void save()}>
            {busy ? "Speichern…" : "Speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}
