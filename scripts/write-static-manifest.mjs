import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { relocateAppChunks } from "./rewrite-app-chunk-dir.mjs";

async function walk(dir, base, out) {
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) await walk(p, base, out);
    else out.push(relative(base, p).replaceAll("\\", "/"));
  }
}

function skipForPublicApp(path) {
  return (
    path === "c2-static-manifest.json" ||
    path.startsWith("data/") ||
    path.startsWith("images/") ||
    path.startsWith("edit/") ||
    path.startsWith("c2-app/")
  );
}

function assetPrefixFor(relPath) {
  const dir = dirname(relPath);
  if (dir === ".") return "./";
  return "../".repeat(dir.split("/").filter(Boolean).length);
}

function relativizeHtml(content, prefix) {
  let next = content
    .replace(/(?<!\.)\/_next\//g, `${prefix}_next/`)
    .replace(/(?<!\.)\/icon\.svg/g, `${prefix}icon.svg`);
  if (prefix !== "./") {
    next = next.replaceAll("./_next/", `${prefix}_next/`).replaceAll("./icon.svg", `${prefix}icon.svg`);
  }
  return next;
}

async function writeCatalogJs(outDir) {
  const dataDir = join(outDir, "data");
  await mkdir(dataDir, { recursive: true });
  const stubs = {
    "tags.json": { version: 1, tags: [{ id: "publish", name: "publish", slug: "publish" }] },
    "photos.json": { version: 1, photos: [] },
    "texts.json": { version: 1, texts: [], items: [] },
    "site.json": {
      version: 1,
      title: "Photos",
      theme: "gallery-v1",
      contactEmail: "",
      layout: {
        gap: 8,
        columns: "mix",
        rowMinHeight: 160,
        rowMaxHeight: 440,
        showPageTitle: true,
        background: "white",
        fadeIn: true,
        fadeInDuration: 0.6,
      },
      pages: [
        { id: "work", type: "work", title: "Work", visibility: "public" },
        { id: "home", type: "gallery", title: "Alle", visibility: "public", filter: {} },
        { id: "contact", type: "contact", title: "Contact", visibility: "public" },
      ],
    },
  };
  for (const [name, body] of Object.entries(stubs)) {
    const path = join(dataDir, name);
    if (!existsSync(path)) await writeFile(path, `${JSON.stringify(body, null, 2)}\n`);
  }
  try {
    const tags = JSON.parse(await readFile(join(dataDir, "tags.json"), "utf8"));
    const photos = JSON.parse(await readFile(join(dataDir, "photos.json"), "utf8"));
    const site = JSON.parse(await readFile(join(dataDir, "site.json"), "utf8"));
    let texts = { version: 1, texts: [], items: [] };
    try {
      texts = JSON.parse(await readFile(join(dataDir, "texts.json"), "utf8"));
    } catch {
      /* optional */
    }
    let filters;
    try {
      filters = JSON.parse(await readFile(join(dataDir, "filters.json"), "utf8"));
    } catch {
      /* optional: alte Exporte mit filterId */
    }
    const bootstrap = `window.__C2_CATALOG__=${JSON.stringify({ tags, photos, site, texts, ...(filters ? { filters } : {}) })};`;
    await writeFile(join(dataDir, "catalog.js"), `${bootstrap}\n`);
    const indexPath = join(outDir, "index.html");
    if (existsSync(indexPath)) {
      let html = await readFile(indexPath, "utf8");
      const tag = `<script id="c2-catalog">${bootstrap.replace(/</g, "\\u003c")}</script>`;
      html = html.replace(/<script id="c2-catalog">[\s\S]*?<\/script>/, "");
      if (html.includes("<head>")) html = html.replace("<head>", `<head>${tag}`);
      else html = `${tag}${html}`;
      await writeFile(indexPath, html);
    }
  } catch {
    /* optional during first builds */
  }
}

const outDir = join(process.cwd(), "out");
const pagesBuild = Boolean(process.env.NEXT_PUBLIC_BASE_PATH && process.env.NEXT_PUBLIC_BASE_PATH !== "/");

await writeCatalogJs(outDir);
await relocateAppChunks(outDir);
await writeFile(join(outDir, ".nojekyll"), "");

const files = [];
await walk(outDir, outDir, files);

if (!pagesBuild) {
  for (const path of files) {
    if (!path.endsWith(".html")) continue;
    const full = join(outDir, path);
    const before = await readFile(full, "utf8");
    const after = relativizeHtml(before, assetPrefixFor(path));
    if (after !== before) await writeFile(full, after);
  }
}

await writeFile(join(outDir, "c2-static-manifest.json"), `${JSON.stringify({ version: 1, files }, null, 2)}\n`);

if (pagesBuild) {
  console.log(`GitHub Pages Build: ${files.length} Dateien, basePath=${process.env.NEXT_PUBLIC_BASE_PATH}`);
  process.exit(0);
}

const appFiles = files.filter((path) => !skipForPublicApp(path));
const snapDir = join(process.cwd(), "public", "c2-app");
await rm(snapDir, { recursive: true, force: true });
for (const path of appFiles) {
  const dest = join(snapDir, path);
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(join(outDir, path), dest);
}
const snapshotManifest = { version: 1, base: "c2-app", files: appFiles };
await writeFile(join(snapDir, "c2-static-manifest.json"), `${JSON.stringify(snapshotManifest, null, 2)}\n`);
await writeFile(join(process.cwd(), "public", "c2-static-manifest.json"), `${JSON.stringify(snapshotManifest, null, 2)}\n`);
console.log(`c2-static-manifest.json: ${files.length} Dateien, App-Snapshot: ${appFiles.length}`);
