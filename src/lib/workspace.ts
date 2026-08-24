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

export async function pickDirectory(mode: "read" | "readwrite" = "readwrite"): Promise<FileSystemDirectoryHandle | null> {
  if (!supportsDirectoryPicker() || typeof window.showDirectoryPicker !== "function") {
    return null;
  }
  try {
    return await window.showDirectoryPicker({ mode });
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

export async function writeTextFile(
  root: FileSystemDirectoryHandle,
  relativePath: string,
  content: string,
): Promise<void> {
  const { dir, name } = splitPath(relativePath);
  const folder = dir ? await ensureDirPath(root, dir) : root;
  const fileHandle = await folder.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

export async function writeBinaryFile(
  root: FileSystemDirectoryHandle,
  relativePath: string,
  data: BufferSource | Blob,
): Promise<void> {
  const { dir, name } = splitPath(relativePath);
  const folder = dir ? await ensureDirPath(root, dir) : root;
  const fileHandle = await folder.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(data);
  await writable.close();
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

export async function copyDirectoryHandle(
  source: FileSystemDirectoryHandle,
  dest: FileSystemDirectoryHandle,
  skipTop: Set<string> = new Set(),
): Promise<void> {
  for await (const [name, handle] of source.entries()) {
    if (skipTop.has(name)) continue;
    if (handle.kind === "directory") {
      const nextDest = await dest.getDirectoryHandle(name, { create: true });
      await copyDirectoryHandle(handle as FileSystemDirectoryHandle, nextDest);
    } else {
      const file = await (handle as FileSystemFileHandle).getFile();
      await writeBinaryFile(dest, name, file);
    }
  }
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
