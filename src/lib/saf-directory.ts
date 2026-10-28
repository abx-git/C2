import {
  C2Fs,
  base64FromBytes,
  bytesFromBase64,
  isCapacitorNative,
  joinSafPath,
  type C2FsDirectory,
} from "@/lib/c2-fs";

export const SAF_HANDLE = Symbol("c2SafHandle");

type SafMeta = {
  uri: string;
  path: string;
  name: string;
};

function metaOf(handle: FileSystemHandle): SafMeta | null {
  const raw = (handle as FileSystemHandle & { [SAF_HANDLE]?: SafMeta })[SAF_HANDLE];
  return raw ?? null;
}

export function isSafHandle(handle: FileSystemHandle | null | undefined): boolean {
  return Boolean(handle && metaOf(handle));
}

export function safUriOf(handle: FileSystemDirectoryHandle): string | null {
  return metaOf(handle)?.uri ?? null;
}

class SafWritable {
  private chunks: BlobPart[] = [];
  constructor(
    private readonly uri: string,
    private readonly path: string,
  ) {}

  async write(data: BufferSource | Blob | string): Promise<void> {
    this.chunks.push(data as BlobPart);
  }

  async close(): Promise<void> {
    const blob = new Blob(this.chunks);
    const data = await base64FromBytes(blob);
    await C2Fs.writeFile({ uri: this.uri, path: this.path, data });
    this.chunks = [];
  }

  async abort(): Promise<void> {
    this.chunks = [];
  }
}

function createFileHandle(uri: string, path: string, name: string): FileSystemFileHandle {
  const handle = {
    kind: "file" as const,
    name,
    [SAF_HANDLE]: { uri, path, name } satisfies SafMeta,
    async getFile(): Promise<File> {
      const result = await C2Fs.readFile({ uri, path });
      const bytes = bytesFromBase64(result.data);
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      return new File([copy], result.name || name, {
        type: result.mimeType || "application/octet-stream",
      });
    },
    async createWritable() {
      return new SafWritable(uri, path) as unknown as FileSystemWritableFileStream;
    },
    async queryPermission() {
      return "granted" as PermissionState;
    },
    async requestPermission() {
      return "granted" as PermissionState;
    },
    async isSameEntry(other: FileSystemHandle) {
      const otherMeta = metaOf(other);
      return Boolean(otherMeta && otherMeta.uri === uri && otherMeta.path === path);
    },
  };
  return handle as unknown as FileSystemFileHandle;
}

export function createSafDirectoryHandle(uri: string, path = "", name = "Ordner"): FileSystemDirectoryHandle {
  const leaf = name || path.split("/").filter(Boolean).at(-1) || "Ordner";
  const handle = {
    kind: "directory" as const,
    name: leaf,
    [SAF_HANDLE]: { uri, path, name: leaf } satisfies SafMeta,
    async getDirectoryHandle(childName: string, opts?: { create?: boolean }) {
      const nextPath = joinSafPath(path, childName);
      if (opts?.create) {
        await C2Fs.mkdir({ uri, path: nextPath });
      } else {
        const st = await C2Fs.stat({ uri, path: nextPath });
        if (!st.exists || st.kind !== "directory") {
          throw new DOMException(`Ordner fehlt: ${childName}`, "NotFoundError");
        }
      }
      return createSafDirectoryHandle(uri, nextPath, childName);
    },
    async getFileHandle(childName: string, opts?: { create?: boolean }) {
      const nextPath = joinSafPath(path, childName);
      if (opts?.create) {
        const st = await C2Fs.stat({ uri, path: nextPath });
        if (!st.exists) {
          await C2Fs.writeFile({ uri, path: nextPath, data: "" });
        }
      } else {
        const st = await C2Fs.stat({ uri, path: nextPath });
        if (!st.exists || st.kind !== "file") {
          throw new DOMException(`Datei fehlt: ${childName}`, "NotFoundError");
        }
      }
      return createFileHandle(uri, nextPath, childName);
    },
    async removeEntry(childName: string, opts?: { recursive?: boolean }) {
      await C2Fs.remove({
        uri,
        path: joinSafPath(path, childName),
        recursive: Boolean(opts?.recursive),
      });
    },
    async queryPermission() {
      return "granted" as PermissionState;
    },
    async requestPermission() {
      return "granted" as PermissionState;
    },
    async isSameEntry(other: FileSystemHandle) {
      const otherMeta = metaOf(other);
      return Boolean(otherMeta && otherMeta.uri === uri && otherMeta.path === path);
    },
    async *entries(): AsyncIterableIterator<[string, FileSystemHandle]> {
      const { entries } = await C2Fs.list({ uri, path });
      for (const entry of entries) {
        const childPath = joinSafPath(path, entry.name);
        if (entry.kind === "directory") {
          yield [entry.name, createSafDirectoryHandle(uri, childPath, entry.name)];
        } else {
          yield [entry.name, createFileHandle(uri, childPath, entry.name)];
        }
      }
    },
    async *keys(): AsyncIterableIterator<string> {
      for await (const [name] of this.entries()) yield name;
    },
    async *values(): AsyncIterableIterator<FileSystemHandle> {
      for await (const [, value] of this.entries()) yield value;
    },
  };
  return handle as unknown as FileSystemDirectoryHandle;
}

export async function pickSafDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!isCapacitorNative()) return null;
  const picked = await C2Fs.pickDirectory();
  if (!picked?.uri) return null;
  return createSafDirectoryHandle(picked.uri, "", picked.name);
}

export async function persistSafDirectory(handle: FileSystemDirectoryHandle): Promise<void> {
  const meta = metaOf(handle);
  if (!meta) return;
  await C2Fs.persistDirectory({ uri: meta.uri, name: meta.name });
}

export async function loadPersistedSafDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!isCapacitorNative()) return null;
  const saved = await C2Fs.loadPersistedDirectory();
  if (!saved?.uri) return null;
  return createSafDirectoryHandle(saved.uri, "", saved.name);
}

export async function clearPersistedSafDirectory(): Promise<void> {
  if (!isCapacitorNative()) return;
  await C2Fs.clearPersistedDirectory();
}

export function directoryFromC2Fs(dir: C2FsDirectory): FileSystemDirectoryHandle {
  return createSafDirectoryHandle(dir.uri, "", dir.name);
}
