import { registerPlugin } from "@capacitor/core";
import { isCapacitorNative } from "@/lib/c2-fs";

export type C2SyncConfig = {
  host: string;
  port: number;
  user: string;
  hasPassword: boolean;
  remote: string;
  deployUri: string;
  deployName: string;
};

export type C2SyncStatusRaw = {
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
  last?: { ok: boolean; at?: string; error?: string | null } | null;
};

type C2SyncPlugin = {
  getConfig(): Promise<C2SyncConfig>;
  saveConfig(options: {
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    remote?: string;
    deployUri?: string;
    deployName?: string;
  }): Promise<void>;
  setDeployDirectory(options: { uri: string; name: string }): Promise<void>;
  status(options: { probe?: boolean; subdir?: string }): Promise<C2SyncStatusRaw>;
  transfer(options: {
    subdir?: string;
    host?: string;
    remote?: string;
    method?: string;
    rcloneRemote?: string;
  }): Promise<{ ok: boolean; error?: string; remote?: string; fileCount?: number }>;
};

export const C2Sync = registerPlugin<C2SyncPlugin>("C2Sync");

export function hasNativeSync(): boolean {
  return isCapacitorNative();
}
