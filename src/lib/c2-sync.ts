import { normalizePublishPath } from "@/lib/catalog";
import { isCapacitorNative } from "@/lib/c2-fs";
import { C2Sync, hasNativeSync } from "@/lib/c2-sync-native";
import { emptyProjectSync, projectSyncForTransfer, type ProjectSync } from "@/lib/project-sync";
import { safUriOf } from "@/lib/saf-directory";

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
  rcloneRemote?: string | null;
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
    rcloneRemote: typeof raw.rcloneRemote === "string" ? raw.rcloneRemote : null,
    reachable: typeof raw.reachable === "boolean" ? raw.reachable : undefined,
    probeError: typeof raw.probeError === "string" ? raw.probeError : null,
    last,
  };
}

export async function fetchSyncStatus(probe = false, publishPath = ""): Promise<SyncStatus | null> {
  if (hasNativeSync()) {
    try {
      const slug = normalizePublishPath(publishPath);
      const raw = await C2Sync.status({ probe, subdir: slug });
      return asStatus(raw as unknown as Record<string, unknown>);
    } catch {
      return null;
    }
  }
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), probe ? 20000 : 2500);
  try {
    const params = new URLSearchParams();
    if (probe) params.set("probe", "1");
    const slug = normalizePublishPath(publishPath);
    if (slug) params.set("subdir", slug);
    const query = params.toString();
    const res = await fetch(`${SYNC_URL}/status${query ? `?${query}` : ""}`, { signal: ctrl.signal });
    if (!res.ok) return null;
    return asStatus(await readJson(res));
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function runSyncTransfer(
  publishPath = "",
  project?: ProjectSync | null,
): Promise<{ ok: boolean; error: string; via?: "helper" | "app" | "native"; remote?: string; fileCount?: number }> {
  const slug = normalizePublishPath(publishPath);
  if (hasNativeSync()) {
    try {
      // Auf Android: Ziel nur aus Sync-Setup (likibox) + publishPath — nicht aus data/sync.json.
      const body = await C2Sync.transfer({ subdir: slug });
      if (body.ok === true) {
        return {
          ok: true,
          error: "",
          via: "native",
          remote: typeof body.remote === "string" ? body.remote : undefined,
          fileCount: typeof body.fileCount === "number" ? body.fileCount : undefined,
        };
      }
      return {
        ok: false,
        error: typeof body.error === "string" && body.error.trim() ? body.error : "Übertragung fehlgeschlagen.",
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Übertragung fehlgeschlagen.",
      };
    }
  }
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 30 * 60 * 1000);
  try {
    const res = await fetch(`${SYNC_URL}/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subdir: slug, ...projectSyncForTransfer(project ?? emptyProjectSync()) }),
      signal: ctrl.signal,
    });
    const body = await readJson(res);
    if (body.ok === true) return { ok: true, error: "", via: "helper" };
    const error =
      typeof body.error === "string" && body.error.trim()
        ? body.error
        : `Übertragung fehlgeschlagen (${res.status}).`;
    return { ok: false, error };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, error: "Zeitüberschreitung bei der Übertragung." };
    }
    startProtocolTransfer(publishPath);
    return { ok: true, error: "", via: "app" };
  } finally {
    window.clearTimeout(timer);
  }
}

export async function rememberDeployDirectory(handle: FileSystemDirectoryHandle): Promise<void> {
  if (!hasNativeSync()) return;
  const uri = safUriOf(handle);
  if (!uri) return;
  try {
    await C2Sync.setDeployDirectory({ uri, name: handle.name });
  } catch {
    /* best-effort */
  }
}

/** Startet die Mac/Windows-App, die rclone/Mutagen auf den Likibox-Server ausführt. */
export function startProtocolTransfer(publishPath = ""): void {
  if (typeof document === "undefined" || isCapacitorNative()) return;
  const slug = normalizePublishPath(publishPath);
  const url = slug
    ? `c2sync://transfer?subdir=${encodeURIComponent(slug)}`
    : "c2sync://transfer";
  const link = document.createElement("a");
  link.href = url;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function pathLeaf(path: string | null | undefined): string {
  if (!path) return "";
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.at(-1) ?? "";
}

function pathParentLeaf(path: string | null | undefined): string {
  if (!path) return "";
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.length >= 2 ? (parts.at(-2) ?? "") : "";
}

/** Hinweis ohne Rohpfad, wenn der öffentliche Ordner für ein Unterprojekt noch fehlt. */
export function missingDeployHint(status: SyncStatus | null, publishPath = ""): string {
  const slug = normalizePublishPath(publishPath);
  if (hasNativeSync()) {
    return slug
      ? `Noch kein Deploy-Ordner. „Deploy-Ordner“ tippen und den lokalen Ordner wählen, dessen Inhalt nach …/${slug}/ soll.`
      : "Noch kein Deploy-Ordner. „Deploy-Ordner“ tippen und den lokalen Ordner für die Website wählen.";
  }
  const parent = pathParentLeaf(status?.deploy);
  const folder = pathLeaf(status?.deploy) || (slug ? `${slug}.deploy` : "");
  if (slug) {
    const where = parent ? `den Ordner „${parent}“` : "den Ordner der Hauptgalerie";
    return `Noch kein öffentlicher Ordner für „${slug}“. „Zum Server“ legt ${folder} an — bitte ${where} wählen, nicht den Projektordner.`;
  }
  return "Der Deploy-Ordner der Hauptgalerie fehlt. Einmal setup.command und den Galerie-Ordner angeben.";
}

export function wrongDeployFolderHint(status: SyncStatus | null, publishPath = ""): string {
  if (hasNativeSync()) {
    return "Deploy-Ordner fehlt noch. Bitte „Deploy-Ordner“ ausführen und einen Ordner wählen.";
  }
  const slug = normalizePublishPath(publishPath);
  const parent = pathParentLeaf(status?.deploy);
  if (slug) {
    const where = parent ? `„${parent}“` : "den Ordner der Hauptgalerie";
    return `Das war nicht ${where}. Bitte denselben Ordner wählen, in dem die Hauptgalerie liegt — nicht den Projektordner.`;
  }
  return "Der gewählte Ordner ist nicht der Deploy-Ordner der Hauptgalerie.";
}

export function deployFolderPickHint(publishPath = "", remoteBase = "likibox"): string {
  const slug = normalizePublishPath(publishPath);
  const base = (remoteBase || "likibox").replace(/^\/+|\/+$/g, "") || "likibox";
  if (slug) {
    return `Als Nächstes einen leeren (oder bestehenden) lokalen Ordner wählen. Dorthin wird die Website geschrieben und später nach ${base}/${slug}/ hochgeladen — nicht den Projektordner mit originals/.`;
  }
  return `Als Nächstes einen lokalen Ordner wählen. Dorthin wird die Website geschrieben und später nach ${base}/ hochgeladen — nicht den Projektordner mit originals/.`;
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function pageCannotReachLocalHelper(): boolean {
  if (typeof window === "undefined") return false;
  if (isCapacitorNative()) return false;
  const { protocol, hostname } = window.location;
  return protocol === "https:" && !isLoopbackHost(hostname);
}

export function describeSync(
  status: SyncStatus | null,
  project?: ProjectSync | null,
  publishPath = "",
): { label: string; tone: "ok" | "warn" | "err" } {
  if (!status) {
    if (hasNativeSync()) {
      return {
        label: "Native Sync nicht erreichbar. App neu starten.",
        tone: "err",
      };
    }
    if (pageCannotReachLocalHelper()) {
      return {
        label: "Ziel ist der Likibox-Server. Dieser Tab spricht den Helfer nicht direkt an — „Zum Server“ startet die Übertragung auf diesem Mac.",
        tone: "warn",
      };
    }
    return {
      label: "Sync-Helfer läuft gerade nicht. „Zum Server“ startet trotzdem die Übertragung auf den Likibox-Server. Sonst einmal setup.command öffnen.",
      tone: "warn",
    };
  }
  if (!status.configured) {
    return {
      label: hasNativeSync()
        ? "Sync nicht eingerichtet — unter „Sync einrichten“ Host, Benutzer, Passwort und Remote-Pfad angeben."
        : "Sync nicht eingerichtet — Setup ausführen und Deploy-Ordner sowie Host angeben.",
      tone: "err",
    };
  }
  if (status.busy) {
    return { label: "Sync: Übertragung läuft…", tone: "warn" };
  }
  if (!status.deployExists) {
    return {
      label: missingDeployHint(status, publishPath),
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
    const lastError = (status.last.error ?? "").trim();
    if (/Deploy-Ordner fehlt/i.test(lastError) && status.deployExists) {
      /* veraltet: der Ordner ist inzwischen da */
    } else if (/Deploy-Ordner fehlt/i.test(lastError)) {
      return { label: missingDeployHint(status, publishPath), tone: "err" };
    } else {
      return {
        label: `Sync: letzte Übertragung fehlgeschlagen. ${lastError}`.trim(),
        tone: "err",
      };
    }
  }
  const slug = normalizePublishPath(publishPath);
  const base = (project?.remote || status.remote || "").replace(/\/+$/, "");
  const remote = project?.remote ? (slug ? `${base}/${slug}` : base) : status.remote;
  const host = project?.host || status.host;
  const target = [host, remote].filter(Boolean).join(":");
  const method = (project?.method || status.method) === "rclone" || hasNativeSync() ? "SFTP" : "Mutagen";
  return {
    label: target ? `Bereit für den Likibox-Server (${method} → ${target})` : `Bereit für den Likibox-Server (${method})`,
    tone: "ok",
  };
}
