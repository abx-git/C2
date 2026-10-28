import { Capacitor, registerPlugin } from "@capacitor/core";

export type C2FsEntry = { name: string; kind: "file" | "directory" };

export type C2FsDirectory = {
  uri: string;
  name: string;
};

type C2FsPlugin = {
  pickDirectory(): Promise<C2FsDirectory | undefined>;
  persistDirectory(options: C2FsDirectory): Promise<void>;
  loadPersistedDirectory(): Promise<C2FsDirectory | undefined>;
  clearPersistedDirectory(): Promise<void>;
  list(options: { uri: string; path?: string }): Promise<{ entries: C2FsEntry[] }>;
  mkdir(options: { uri: string; path: string }): Promise<void>;
  readFile(options: { uri: string; path: string }): Promise<{
    data: string;
    name: string;
    size: number;
    mimeType: string;
  }>;
  writeFile(options: { uri: string; path: string; data: string }): Promise<void>;
  remove(options: { uri: string; path: string; recursive?: boolean }): Promise<void>;
  stat(options: { uri: string; path?: string }): Promise<{
    exists: boolean;
    kind?: "file" | "directory";
    name?: string;
    size?: number;
  }>;
};

export const C2Fs = registerPlugin<C2FsPlugin>("C2Fs");

export function isCapacitorNative(): boolean {
  return Capacitor.isNativePlatform();
}

export function joinSafPath(...parts: string[]): string {
  return parts
    .flatMap((part) => part.replace(/\\/g, "/").split("/"))
    .filter((part) => part && part !== ".")
    .join("/");
}

export function base64FromBytes(data: ArrayBuffer | Uint8Array | Blob | string): Promise<string> {
  if (typeof data === "string") {
    return Promise.resolve(btoa(unescape(encodeURIComponent(data))));
  }
  const toBase64 = (buf: ArrayBuffer) => {
    const bytes = new Uint8Array(buf);
    let binary = "";
    const chunk = 0x2000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
    }
    return btoa(binary);
  };
  if (data instanceof Blob) {
    return data.arrayBuffer().then(toBase64);
  }
  if (data instanceof ArrayBuffer) return Promise.resolve(toBase64(data));
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return Promise.resolve(toBase64(copy.buffer));
}

export function bytesFromBase64(data: string): Uint8Array {
  const binary = atob(data);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}
