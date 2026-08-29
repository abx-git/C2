import {
  toPublicCatalog,
  toPublicPhotos,
  watermarkLabel,
  type Catalog,
  type SiteProtection,
} from "./catalog";
import { catalogBootstrapScript, injectCatalogIntoHtml } from "./catalog-source";
import { rewriteAssetPaths } from "./deploy-paths";
import { createCryptoParams, encryptBytes, stampWatermark } from "./image-protect";
import {
  copyDirectoryHandle,
  ensureDirPath,
  fileSizeInDir,
  listRelativeFiles,
  readBinaryFile,
  readTextFile,
  removeMissingNames,
  runPool,
  writeBinaryFile,
  writeFileInDir,
  writeJsonFile,
  writeTextFile,
  getDirectoryAtPath,
} from "./workspace";

export type DeployResult = {
  photoCount: number;
  skipped: number;
  copiedApp: boolean;
  appSource: "origin" | "folder" | "none";
  encrypted: boolean;
  watermarked: boolean;
};

export type DeployProgress = {
  current: number;
  total: number;
  skipped: number;
};

type Manifest = {
  files?: string[];
  base?: string;
};

function fileName(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() ?? path;
}

async function folderFile(folder: FileSystemDirectoryHandle, name: string): Promise<File | null> {
  try {
    return await (await folder.getFileHandle(name)).getFile();
  } catch {
    return null;
  }
}

async function writeIfChanged(
  folder: FileSystemDirectoryHandle,
  name: string,
  data: BufferSource | Blob,
  skipIfSize?: number,
): Promise<boolean> {
  if (skipIfSize != null) {
    const existing = await fileSizeInDir(folder, name);
    if (existing === skipIfSize) return false;
  }
  await writeFileInDir(folder, name, data);
  return true;
}

function skipDeployPath(path: string): boolean {
  return (
    path === "c2-static-manifest.json" ||
    path.startsWith("data/") ||
    path.startsWith("images/") ||
    path.startsWith("edit/") ||
    path.startsWith("c2-app/")
  );
}

async function loadManifest(url: string): Promise<Manifest | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  return (await res.json()) as Manifest;
}

async function rewriteCopiedAppForFileOpen(dest: FileSystemDirectoryHandle): Promise<void> {
  const files = await listRelativeFiles(dest, "", new Set(["data", "images"]));
  for (const path of files) {
    if (!/\.(html|js|css|txt)$/.test(path)) continue;
    const text = await readTextFile(dest, path);
    if (text == null) continue;
    const next = rewriteAssetPaths(path, text);
    if (next !== text) await writeTextFile(dest, path, next);
  }
}

async function copyAppFromOrigin(dest: FileSystemDirectoryHandle, originBase: string): Promise<boolean> {
  const base = originBase.replace(/\/$/, "") || ".";
  const candidates = [`${base}/c2-static-manifest.json`, `${base}/c2-app/c2-static-manifest.json`];
  let manifest: Manifest | null = null;
  let fileBase = base;
  for (const url of candidates) {
    const loaded = await loadManifest(url);
    const files = loaded?.files?.filter((path) => !skipDeployPath(path)) ?? [];
    if (!files.length) continue;
    manifest = { ...loaded, files };
    const prefix = loaded?.base?.replace(/^\/+|\/+$/g, "");
    fileBase = prefix ? `${base}/${prefix}` : url.includes("/c2-app/") ? `${base}/c2-app` : base;
    break;
  }
  const files = manifest?.files ?? [];
  if (!files.length) return false;
  await runPool(files, 8, async (path) => {
    const fileRes = await fetch(`${fileBase}/${path}`);
    if (!fileRes.ok) return;
    const buf = await fileRes.arrayBuffer();
    await writeBinaryFile(dest, path, buf);
  });
  await writeJsonFile(dest, "c2-static-manifest.json", { version: 1, files });
  return true;
}

function publicProtection(protection: SiteProtection | undefined, crypto?: SiteProtection["crypto"]): SiteProtection {
  return {
    watermark: Boolean(protection?.watermark),
    watermarkText: protection?.watermarkText ?? "",
    passwordProtect: false,
    ...(crypto ? { crypto } : {}),
  };
}

async function publishImage(
  file: File,
  opts: { watermark?: string; key?: CryptoKey },
): Promise<BufferSource | Blob> {
  let blob: Blob = file;
  if (opts.watermark) blob = await stampWatermark(blob, opts.watermark);
  if (opts.key) return encryptBytes(opts.key, await blob.arrayBuffer());
  return blob;
}

export async function writeDeployFolder(opts: {
  dest: FileSystemDirectoryHandle;
  catalog: Catalog;
  workspace: FileSystemDirectoryHandle;
  appFolder?: FileSystemDirectoryHandle | null;
  originBase?: string;
  password?: string;
  onProgress?: (progress: DeployProgress) => void;
}): Promise<DeployResult> {
  let copiedApp = false;
  let appSource: DeployResult["appSource"] = "none";

  if (opts.appFolder) {
    await copyDirectoryHandle(opts.appFolder, opts.dest, new Set(["data", "images", "edit", "c2-app"]));
    copiedApp = true;
    appSource = "folder";
  } else {
    copiedApp = await copyAppFromOrigin(opts.dest, opts.originBase ?? ".");
    if (copiedApp) appSource = "origin";
  }

  const protection = opts.catalog.site.protection;
  const password = (opts.password ?? "").trim();
  if (protection?.passwordProtect && !password) {
    throw new Error("Galerie-Passwort ist aktiviert, aber leer. Bitte unter Struktur ein Passwort setzen.");
  }

  let crypto = protection?.crypto;
  let key: CryptoKey | undefined;
  if (protection?.passwordProtect) {
    const created = await createCryptoParams(password);
    crypto = created.crypto;
    key = created.key;
  } else {
    crypto = undefined;
  }

  const publicCatalog = toPublicCatalog(opts.catalog);
  const encrypted = Boolean(key);
  const publicPhotos = toPublicPhotos(publicCatalog.photos, encrypted);
  const publicSite = {
    ...publicCatalog.site,
    protection: publicProtection(protection, crypto),
  };
  const published = { ...publicCatalog, photos: publicPhotos, site: publicSite };
  const photos = publicCatalog.photos.photos;

  await Promise.all([
    writeJsonFile(opts.dest, "data/photos.json", publicPhotos),
    writeJsonFile(opts.dest, "data/tags.json", published.tags),
    writeJsonFile(opts.dest, "data/filters.json", published.filters),
    writeJsonFile(opts.dest, "data/site.json", publicSite),
    writeJsonFile(opts.dest, "data/texts.json", published.texts),
  ]);
  const bootstrap = catalogBootstrapScript(published);
  await writeTextFile(opts.dest, "data/catalog.js", `${bootstrap}\n`);
  const indexHtml = await readTextFile(opts.dest, "index.html");
  if (indexHtml) {
    await writeTextFile(opts.dest, "index.html", injectCatalogIntoHtml(indexHtml, bootstrap));
  }
  await rewriteCopiedAppForFileOpen(opts.dest);

  const displayDir = await ensureDirPath(opts.dest, "images/display");
  const thumbDir = await ensureDirPath(opts.dest, "images/thumbs");
  const keepDisplay = new Set(publicPhotos.photos.map((photo) => fileName(photo.files.display)));
  const keepThumb = new Set(publicPhotos.photos.map((photo) => fileName(photo.files.thumb)));
  await Promise.all([removeMissingNames(displayDir, keepDisplay), removeMissingNames(thumbDir, keepThumb)]);

  let srcDisplay: FileSystemDirectoryHandle | null = null;
  let srcThumbs: FileSystemDirectoryHandle | null = null;
  try {
    srcDisplay = await getDirectoryAtPath(opts.workspace, "derived/display");
  } catch {
    srcDisplay = null;
  }
  try {
    srcThumbs = await getDirectoryAtPath(opts.workspace, "derived/thumbs");
  } catch {
    srcThumbs = null;
  }

  const mark = protection?.watermark ? watermarkLabel(protection, opts.catalog.site.title) : "";
  const transform = Boolean(mark || key);
  const publicById = new Map(publicPhotos.photos.map((photo) => [photo.id, photo]));
  let done = 0;
  let skipped = 0;
  const total = photos.length;
  opts.onProgress?.({ current: 0, total, skipped: 0 });

  await runPool(photos, transform ? 3 : 8, async (photo) => {
    const files = publicById.get(photo.id)?.files ?? photo.files;
    const [displayFile, thumbFile] = await Promise.all([
      srcDisplay
        ? (await folderFile(srcDisplay, fileName(photo.files.display))) ?? readBinaryFile(opts.workspace, photo.files.display)
        : readBinaryFile(opts.workspace, photo.files.display),
      srcThumbs
        ? (await folderFile(srcThumbs, fileName(photo.files.thumb))) ?? readBinaryFile(opts.workspace, photo.files.thumb)
        : readBinaryFile(opts.workspace, photo.files.thumb),
    ]);
    if (!displayFile || !thumbFile) throw new Error(`Datei fehlt: ${photo.originalName || photo.id}`);
    const [displayOut, thumbOut] = await Promise.all([
      publishImage(displayFile, { watermark: mark || undefined, key }),
      publishImage(thumbFile, { key }),
    ]);
    const [wroteDisplay, wroteThumb] = await Promise.all([
      writeIfChanged(displayDir, fileName(files.display), displayOut, transform ? undefined : displayFile.size),
      writeIfChanged(thumbDir, fileName(files.thumb), thumbOut, transform ? undefined : thumbFile.size),
    ]);
    done += 1;
    if (!wroteDisplay && !wroteThumb) skipped += 1;
    opts.onProgress?.({ current: done, total, skipped });
    if (done % 4 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  });

  return {
    photoCount: total,
    skipped,
    copiedApp,
    appSource,
    encrypted,
    watermarked: Boolean(mark),
  };
}
