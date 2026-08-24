import { toPublicCatalog, toPublicPhotos, type Catalog } from "./catalog";
import { catalogBootstrapScript, injectCatalogIntoHtml } from "./catalog-source";
import {
  copyDirectoryHandle,
  copyFileBetween,
  readTextFile,
  writeBinaryFile,
  writeJsonFile,
  writeTextFile,
} from "./workspace";

export type DeployResult = {
  photoCount: number;
  copiedApp: boolean;
  appSource: "origin" | "folder" | "none";
};

type Manifest = {
  files?: string[];
  base?: string;
};

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
  for (const path of files) {
    const fileRes = await fetch(`${fileBase}/${path}`);
    if (!fileRes.ok) continue;
    const buf = await fileRes.arrayBuffer();
    await writeBinaryFile(dest, path, buf);
  }
  await writeJsonFile(dest, "c2-static-manifest.json", { version: 1, files });
  return true;
}

export async function writeDeployFolder(opts: {
  dest: FileSystemDirectoryHandle;
  catalog: Catalog;
  workspace: FileSystemDirectoryHandle;
  appFolder?: FileSystemDirectoryHandle | null;
  originBase?: string;
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

  const publicCatalog = toPublicCatalog(opts.catalog);
  const publicPhotos = toPublicPhotos(publicCatalog.photos);
  await writeJsonFile(opts.dest, "data/photos.json", publicPhotos);
  await writeJsonFile(opts.dest, "data/tags.json", publicCatalog.tags);
  await writeJsonFile(opts.dest, "data/site.json", publicCatalog.site);
  await writeJsonFile(opts.dest, "data/texts.json", publicCatalog.texts);
  const bootstrap = catalogBootstrapScript({ ...publicCatalog, photos: publicPhotos });
  await writeTextFile(opts.dest, "data/catalog.js", `${bootstrap}\n`);
  const indexHtml = await readTextFile(opts.dest, "index.html");
  if (indexHtml) {
    await writeTextFile(opts.dest, "index.html", injectCatalogIntoHtml(indexHtml, bootstrap));
  }

  for (const photo of publicCatalog.photos.photos) {
    const files = publicPhotos.photos.find((item) => item.id === photo.id)?.files ?? photo.files;
    await copyFileBetween(opts.workspace, photo.files.display, opts.dest, files.display);
    await copyFileBetween(opts.workspace, photo.files.thumb, opts.dest, files.thumb);
  }

  return {
    photoCount: publicCatalog.photos.photos.length,
    copiedApp,
    appSource,
  };
}
