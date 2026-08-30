const SYNC_URL = "http://127.0.0.1:17843";

export type SyncLast = {
  ok: boolean;
  at?: string;
  error?: string | null;
};

export type SyncStatus = {
  agent: boolean;
  busy?: boolean;
  configured: boolean;
  method?: string | null;
  deploy?: string | null;
  deployExists?: boolean;
  host?: string | null;
  remote?: string | null;
  reachable?: boolean;
  probeError?: string | null;
  last?: SyncLast | null;
};

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function asStatus(raw: Record<string, unknown>): SyncStatus {
  const lastRaw = raw.last;
  let last: SyncLast | null = null;
  if (lastRaw && typeof lastRaw === "object") {
    const row = lastRaw as Record<string, unknown>;
    last = {
      ok: row.ok === true,
      at: typeof row.at === "string" ? row.at : undefined,
      error: typeof row.error === "string" ? row.error : null,
    };
  }
  return {
    agent: raw.agent === true,
    busy: raw.busy === true,
    configured: raw.configured === true,
    method: typeof raw.method === "string" ? raw.method : null,
    deploy: typeof raw.deploy === "string" ? raw.deploy : null,
    deployExists: raw.deployExists === true,
    host: typeof raw.host === "string" ? raw.host : null,
    remote: typeof raw.remote === "string" ? raw.remote : null,
    reachable: typeof raw.reachable === "boolean" ? raw.reachable : undefined,
    probeError: typeof raw.probeError === "string" ? raw.probeError : null,
    last,
  };
}

export async function fetchSyncStatus(probe = false): Promise<SyncStatus | null> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), probe ? 20000 : 2500);
  try {
    const res = await fetch(`${SYNC_URL}/status${probe ? "?probe=1" : ""}`, { signal: ctrl.signal });
    if (!res.ok) return null;
    return asStatus(await readJson(res));
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function runSyncTransfer(): Promise<{ ok: boolean; error: string }> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 30 * 60 * 1000);
  try {
    const res = await fetch(`${SYNC_URL}/transfer`, { method: "POST", signal: ctrl.signal });
    const body = await readJson(res);
    if (body.ok === true) return { ok: true, error: "" };
    const error =
      typeof body.error === "string" && body.error.trim()
        ? body.error
        : `Übertragung fehlgeschlagen (${res.status}).`;
    return { ok: false, error };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, error: "Zeitüberschreitung bei der Übertragung." };
    }
    return {
      ok: false,
      error: "Sync-Helfer nicht erreichbar. Einmal scripts/c2-sync/setup doppelklicken.",
    };
  } finally {
    window.clearTimeout(timer);
  }
}

export function describeSync(status: SyncStatus | null): { label: string; tone: "ok" | "warn" | "err" } {
  if (!status) {
    return {
      label: "Sync nicht eingerichtet — einmal setup.command (Mac) bzw. setup.cmd (Windows) doppelklicken.",
      tone: "err",
    };
  }
  if (!status.configured) {
    return {
      label: "Sync nicht eingerichtet — Setup ausführen und Deploy-Ordner sowie Host angeben.",
      tone: "err",
    };
  }
  if (status.busy) {
    return { label: "Sync: Übertragung läuft…", tone: "warn" };
  }
  if (!status.deployExists) {
    return {
      label: `Sync: Deploy-Ordner fehlt (${status.deploy ?? "unbekannt"}).`,
      tone: "err",
    };
  }
  if (status.reachable === false) {
    return {
      label: `Sync: keine Verbindung zum Server. ${status.probeError ?? "Zugang und Host prüfen."}`,
      tone: "err",
    };
  }
  if (status.last && status.last.ok === false) {
    return {
      label: `Sync: letzte Übertragung fehlgeschlagen. ${status.last.error ?? ""}`.trim(),
      tone: "err",
    };
  }
  const target = [status.host, status.remote].filter(Boolean).join(":");
  const method = status.method === "rclone" ? "SFTP" : "Mutagen";
  return {
    label: target ? `Sync bereit (${method} → ${target})` : `Sync bereit (${method})`,
    tone: "ok",
  };
}
