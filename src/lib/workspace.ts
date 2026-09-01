const IDB_NAME = "c2-workspace";
const IDB_STORE = "handles";
const IDB_KEY = "workspace-folder";

export const WORKSPACE_DIRS = ["originals", "derived/display", "derived/thumbs", "data"] as const;

export function supportsDirectoryPicker(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

export async function queryWriteAccess(handle: FileSystemDirectoryHandle): Promise<boolean> {
  if (!handle.queryPermission) return false;
  try {
    const state = await handle.queryPermission({ mode: "readwrite" });
    if (state === "granted") return true;
    if (handle.requestPermission) {
      const next = await handle.requestPermission({ mode: "readwrite" });
      return next === "granted";
    }
  } catch {
    return false;
  }
  return false;
}

export async function queryReadAccess(handle: FileSystemDirectoryHandle): Promise<boolean> {
  if (!handle.queryPermission) return true;
  try {
    const state = await handle.queryPermission({ mode: "read" });
    if (state === "granted") return true;
    if (handle.requestPermission) {
      const next = await handle.requestPermission({ mode: "read" });
      return next === "granted";
    }
  } catch {
    return false;
  }
  return false;
}

type DirectoryPickerStart =
  | "desktop"
  | "documents"
  | "downloads"
  | "music"
  | "pictures"
  | "videos"
  | FileSystemHandle;

export async function pickDirectory(
  mode: "read" | "readwrite" = "readwrite",
  opts?: { id?: string; startIn?: DirectoryPickerStart },
): Promise<FileSystemDirectoryHandle | null> {
  if (!supportsDirectoryPicker() || typeof window.showDirectoryPicker !== "function") {
    return null;
  }
  try {
    return await window.showDirectoryPicker({
      mode,
      id: opts?.id,
      startIn: opts?.startIn,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return null;
    throw err;
  }
}

export async function ensureDirPath(
  root: FileSystemDirectoryHandle,
  relativeDir: string,
): Promise<FileSystemDirectoryHandle> {
  const parts = relativeDir.split("/").filter(Boolean);
  let cur = root;
  for (const part of parts) {
    cur = await cur.getDirectoryHandle(part, { create: true });
  }
  return cur;
}

export async function getDirectoryAtPath(
  root: FileSystemDirectoryHandle,
  relativeDir: string,
  opts?: { create?: boolean },
): Promise<FileSystemDirectoryHandle> {
  const create = opts?.create ?? false;
  const parts = relativeDir.replace(/\\/g, "/").split("/").filter((p) => p && p !== ".");
  if (parts.length === 0) return root;
  let cur = root;
  for (const part of parts) {
    cur = await cur.getDirectoryHandle(part, { create });
  }
  return cur;
}

function splitPath(relativePath: string): { dir: string; name: string } {
  const norm = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = norm.split("/");
  const name = parts.pop()!;
  return { dir: parts.join("/"), name };
}

const dirCache = new WeakMap<FileSystemDirectoryHandle, Map<string, FileSystemDirectoryHandle>>();

async function cachedDir(root: FileSystemDirectoryHandle, relativeDir: string): Promise<FileSystemDirectoryHandle> {
  if (!relativeDir) return root;
  let map = dirCache.get(root);
  if (!map) {
    map = new Map();
    dirCache.set(root, map);
  }
  const hit = map.get(relativeDir);
  if (hit) return hit;
  const folder = await ensureDirPath(root, relativeDir);
  map.set(relativeDir, folder);
  return folder;
}

export async function runPool<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (!items.length) return;
  let next = 0;
  const workers = Math.min(Math.max(1, limit), items.length);
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (true) {
        const index = next;
        next += 1;
        if (index >= items.length) return;
        await fn(items[index]!, index);
      }
    }),
  );
}

export async function writeFileInDir(
  folder: FileSystemDirectoryHandle,
  name: string,
  data: BufferSource | Blob | string,
): Promise<void> {
  const fileHandle = await folder.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(data);
  await writable.close();
}

export async function fileSizeInDir(folder: FileSystemDirectoryHandle, name: string): Promise<number | null> {
  try {
    const file = await (await folder.getFileHandle(name)).getFile();
    return file.size;
  } catch {
    return null;
  }
}

export async function listEntryNames(folder: FileSystemDirectoryHandle): Promise<string[]> {
  const names: string[] = [];
  for await (const [name] of folder.entries()) names.push(name);
  return names;
}

export async function writeTextFile(
  root: FileSystemDirectoryHandle,
  relativePath: string,
  content: string,
): Promise<void> {
  const { dir, name } = splitPath(relativePath);
  const folder = dir ? await cachedDir(root, dir) : root;
  await writeFileInDir(folder, name, content);
}

export async function writeBinaryFile(
  root: FileSystemDirectoryHandle,
  relativePath: string,
  data: BufferSource | Blob,
): Promise<void> {
  const { dir, name } = splitPath(relativePath);
  const folder = dir ? await cachedDir(root, dir) : root;
  await writeFileInDir(folder, name, data);
}

export async function readTextFile(root: FileSystemDirectoryHandle, relativePath: string): Promise<string | null> {
  try {
    const { dir, name } = splitPath(relativePath);
    const folder = dir ? await getDirectoryAtPath(root, dir) : root;
    const fileHandle = await folder.getFileHandle(name);
    const file = await fileHandle.getFile();
    return await file.text();
  } catch {
    return null;
  }
}

export async function readBinaryFile(root: FileSystemDirectoryHandle, relativePath: string): Promise<File | null> {
  try {
    const { dir, name } = splitPath(relativePath);
    const folder = dir ? await getDirectoryAtPath(root, dir) : root;
    const fileHandle = await folder.getFileHandle(name);
    return await fileHandle.getFile();
  } catch {
    return null;
  }
}

export async function removeFile(root: FileSystemDirectoryHandle, relativePath: string): Promise<void> {
  const { dir, name } = splitPath(relativePath);
  const folder = dir ? await getDirectoryAtPath(root, dir) : root;
  await folder.removeEntry(name);
}

export async function readJsonFile(root: FileSystemDirectoryHandle, relativePath: string): Promise<unknown | null> {
  const text = await readTextFile(root, relativePath);
  if (text == null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export async function writeJsonFile(root: FileSystemDirectoryHandle, relativePath: string, value: unknown): Promise<void> {
  await writeTextFile(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function emptyDirectory(root: FileSystemDirectoryHandle, relativeDir: string): Promise<void> {
  let folder: FileSystemDirectoryHandle;
  try {
    folder = await getDirectoryAtPath(root, relativeDir);
  } catch {
    return;
  }
  const entries: { name: string; kind: string }[] = [];
  for await (const [name, handle] of folder.entries()) {
    entries.push({ name, kind: handle.kind });
  }
  for (const entry of entries) {
    await folder.removeEntry(entry.name, { recursive: entry.kind === "directory" });
  }
  dirCache.get(root)?.delete(relativeDir);
}

export async function removeMissingNames(folder: FileSystemDirectoryHandle, keep: Set<string>): Promise<void> {
  const names = await listEntryNames(folder);
  await runPool(
    names.filter((name) => !keep.has(name)),
    8,
    async (name) => {
      await folder.removeEntry(name, { recursive: true });
    },
  );
}

export async function copyFileBetween(
  sourceRoot: FileSystemDirectoryHandle,
  sourcePath: string,
  destRoot: FileSystemDirectoryHandle,
  destPath: string,
): Promise<void> {
  const file = await readBinaryFile(sourceRoot, sourcePath);
  if (!file) throw new Error(`Datei fehlt: ${sourcePath}`);
  await writeBinaryFile(destRoot, destPath, file);
}

export async function listRelativeFiles(
  root: FileSystemDirectoryHandle,
  prefix = "",
  skipTop: Set<string> = new Set(),
): Promise<string[]> {
  const out: string[] = [];
  for await (const [name, handle] of root.entries()) {
    if (!prefix && skipTop.has(name)) continue;
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "directory") {
      out.push(...(await listRelativeFiles(handle as FileSystemDirectoryHandle, path)));
    } else {
      out.push(path);
    }
  }
  return out;
}

const SKIP_COPY_NAMES = new Set([".DS_Store"]);

export async function copyDirectoryHandle(
  source: FileSystemDirectoryHandle,
  dest: FileSystemDirectoryHandle,
  skipTop: Set<string> = new Set(),
): Promise<void> {
  for await (const [name, handle] of source.entries()) {
    if (skipTop.has(name) || SKIP_COPY_NAMES.has(name)) continue;
    if (handle.kind === "directory") {
      const nextDest = await dest.getDirectoryHandle(name, { create: true });
      await copyDirectoryHandle(handle as FileSystemDirectoryHandle, nextDest);
    } else {
      const file = await (handle as FileSystemFileHandle).getFile();
      await writeBinaryFile(dest, name, file);
    }
  }
}

export async function copyProjectFiles(
  source: FileSystemDirectoryHandle,
  dest: FileSystemDirectoryHandle,
  onProgress?: (current: number, total: number) => void,
): Promise<number> {
  const files = (await listRelativeFiles(source)).filter(
    (path) => !path.split("/").some((part) => SKIP_COPY_NAMES.has(part)),
  );
  onProgress?.(0, files.length);
  let done = 0;
  await runPool(files, 4, async (path) => {
    await copyFileBetween(source, path, dest, path);
    done += 1;
    onProgress?.(done, files.length);
  });
  return files.length;
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(handle, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* persistence is best-effort */
  }
}

export async function loadDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openIdb();
    const handle = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return handle;
  } catch {
    return null;
  }
}

export async function clearDirectoryHandle(): Promise<void> {
  try {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* ignore */
  }
}
