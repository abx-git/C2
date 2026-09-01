export const PROJECT_SYNC_PATH = "data/sync.json";

export type ProjectSyncMethod = "rclone" | "mutagen" | "";

export type ProjectSync = {
  version: 1;
  method: ProjectSyncMethod;
  host: string;
  remote: string;
  rcloneRemote: string;
};

export function emptyProjectSync(): ProjectSync {
  return { version: 1, method: "", host: "", remote: "", rcloneRemote: "" };
}

function asMethod(raw: unknown): ProjectSyncMethod {
  return raw === "rclone" || raw === "mutagen" ? raw : "";
}

export function parseProjectSync(raw: unknown): ProjectSync {
  if (typeof raw !== "object" || raw === null) return emptyProjectSync();
  const row = raw as Record<string, unknown>;
  const rcloneRemote =
    typeof row.rcloneRemote === "string"
      ? row.rcloneRemote
      : typeof row.rclone_remote === "string"
        ? row.rclone_remote
        : "";
  return {
    version: 1,
    method: asMethod(row.method),
    host: typeof row.host === "string" ? row.host.trim() : "",
    remote: typeof row.remote === "string" ? row.remote.trim().replace(/^\/+|\/+$/g, "") : "",
    rcloneRemote: rcloneRemote.trim(),
  };
}

export function projectSyncIsEmpty(sync: ProjectSync): boolean {
  return !sync.host && !sync.remote && !sync.method && !sync.rcloneRemote;
}

export function projectSyncForTransfer(sync: ProjectSync): {
  host?: string;
  remote?: string;
  method?: string;
  rcloneRemote?: string;
} {
  const out: { host?: string; remote?: string; method?: string; rcloneRemote?: string } = {};
  if (sync.host) out.host = sync.host;
  if (sync.remote) out.remote = sync.remote;
  if (sync.method) out.method = sync.method;
  if (sync.rcloneRemote) out.rcloneRemote = sync.rcloneRemote;
  return out;
}
