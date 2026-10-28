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

function syncQuery(probe: boolean, publishPath: string, projectFolder = ""): URLSearchParams {
  const params = new URLSearchParams();
  if (probe) params.set("probe", "1");
  const slug = normalizePublishPath(publishPath);
  if (slug) params.set("subdir", slug);
  const project = projectFolder.trim();
  if (project) params.set("project", project);
  return params;
}

export async function fetchSyncStatus(
  probe = false,
  publishPath = "",
  projectFolder = "",
): Promise<SyncStatus | null> {
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
    const query = syncQuery(probe, publishPath, projectFolder).toString();
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
  projectFolder = "",
): Promise<{ ok: boolean; error: string; via?: "helper" | "app" | "native"; remote?: string; fileCount?: number }> {
  const slug = normalizePublishPath(publishPath);
  const projectName = projectFolder.trim();
  if (hasNativeSync()) {
    try {
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
        error: typeof body.error === "string" && body.error.trim() ? body.error : "Upload fehlgeschlagen.",
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Upload fehlgeschlagen.",
      };
    }
  }
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 30 * 60 * 1000);
  try {
    const res = await fetch(`${SYNC_URL}/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subdir: slug,
        project: projectName,
        ...projectSyncForTransfer(project ?? emptyProjectSync()),
      }),
      signal: ctrl.signal,
    });
    const body = await readJson(res);
    if (body.ok === true) return { ok: true, error: "", via: "helper" };
    const error =
      typeof body.error === "string" && body.error.trim()
        ? body.error
        : `Upload fehlgeschlagen (${res.status}).`;
    return { ok: false, error };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, error: "Zeitüberschreitung beim Upload." };
    }
    startProtocolTransfer(publishPath, projectName);
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

export function startProtocolTransfer(publishPath = "", projectFolder = ""): void {
  if (typeof document === "undefined" || isCapacitorNative()) return;
  const slug = normalizePublishPath(publishPath);
  const params = new URLSearchParams();
  if (slug) params.set("subdir", slug);
  const project = projectFolder.trim();
  if (project) params.set("project", project);
  const qs = params.toString();
  const url = qs ? `c2sync://transfer?${qs}` : "c2sync://transfer";
  const link = document.createElement("a");
  link.href = url;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
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

/** Kurzer Status für das Projektmenü. */
export function describeSync(
  status: SyncStatus | null,
  project?: ProjectSync | null,
  publishPath = "",
  localDeployReady = false,
): { label: string; tone: "ok" | "warn" | "err" } {
  const slug = normalizePublishPath(publishPath);
  const remote = (project?.remote || status?.remote || "likibox").replace(/\/+$/, "") || "likibox";
  const serverPath = slug ? `${remote}/${slug}/` : `${remote}/`;

  if (hasNativeSync()) {
    if (!status) {
      return { label: "Upload: App neu starten.", tone: "err" };
    }
    if (!status.configured) {
      return { label: "Upload: einmal „Sync einrichten“ (SFTP).", tone: "err" };
    }
    if (!localDeployReady && !status.deployExists) {
      return { label: "Noch nicht veröffentlicht — „Veröffentlichen“ baut die Website in deploy/.", tone: "warn" };
    }
    if (status.reachable === false) {
      return { label: `Server nicht erreichbar. Ziel: ${serverPath}`, tone: "err" };
    }
    if (status.busy) return { label: "Upload läuft…", tone: "warn" };
    return { label: `Bereit — Upload nach ${serverPath}`, tone: "ok" };
  }

  if (!status) {
    if (pageCannotReachLocalHelper()) {
      return {
        label: `Upload startet auf diesem Mac (Ziel ${serverPath}).`,
        tone: "warn",
      };
    }
    return {
      label: localDeployReady
        ? `Website in deploy/ — Upload mit „Veröffentlichen“ oder Desktop-Verknüpfung (${serverPath}).`
        : "Sync-Helfer optional — einmal setup.command, dann „Veröffentlichen“.",
      tone: "warn",
    };
  }

  if (!status.configured) {
    return { label: "Sync-Helfer fehlt — setup.command (Mac) bzw. setup.cmd (Windows).", tone: "err" };
  }
  if (!localDeployReady && !status.deployExists) {
    return { label: "Noch nicht veröffentlicht — „Veröffentlichen“ legt deploy/ im Projekt an.", tone: "warn" };
  }
  if (status.busy) return { label: "Upload läuft…", tone: "warn" };
  if (status.reachable === false) {
    return {
      label: `Server nicht erreichbar (${serverPath}). ${status.probeError ?? ""}`.trim(),
      tone: "err",
    };
  }
  if (status.last?.ok === false && status.last.error) {
    return { label: `Letzter Upload fehlgeschlagen: ${status.last.error}`, tone: "err" };
  }
  return { label: `Bereit — Upload nach ${serverPath}`, tone: "ok" };
}

export function formatUploadResultMessage(
  ok: boolean,
  error: string,
  via: "helper" | "app" | "native" | undefined,
  linkHint: string,
): string {
  if (!ok) return error || "Upload fehlgeschlagen.";
  if (via === "app") {
    return `Upload gestartet (C2 Sync). ${linkHint}`;
  }
  return `Upload abgeschlossen. ${linkHint}`;
}

/** @deprecated Nur noch für Alt-Texte — bitte describeSync nutzen. */
export function missingDeployHint(): string {
  return "Zuerst „Veröffentlichen“ — die Website landet in deploy/ im Projektordner.";
}

export function deployFolderPickHint(): string {
  return "Die Website wird in deploy/ im Projektordner erzeugt — kein extra Ordner nötig.";
}

export function wrongDeployFolderHint(): string {
  return missingDeployHint();
}
