import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const root = join(import.meta.dirname, "..");
const workspace = process.env.C2_WORKSPACE || join(homedir(), "Documents", "c2.site");
const dest = join(root, "public");

function ext(path) {
  const match = String(path).match(/\.([a-z0-9]+)$/i);
  return match?.[1]?.toLowerCase() ?? "webp";
}

function isPublish(tags) {
  return Array.isArray(tags) && tags.some((tag) => tag === "publish");
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function copyTo(from, to) {
  await mkdir(dirname(to), { recursive: true });
  await copyFile(from, to);
}

if (!existsSync(join(workspace, "data", "photos.json"))) {
  console.log(`Kein Workspace unter ${workspace} — public/ bleibt unverändert.`);
  process.exit(0);
}

const tags = await readJson(join(workspace, "data", "tags.json"));
const photosFile = await readJson(join(workspace, "data", "photos.json"));
const site = await readJson(join(workspace, "data", "site.json"));
let textsFile = { version: 1, texts: [], items: [] };
try {
  textsFile = await readJson(join(workspace, "data", "texts.json"));
} catch {
  /* optional */
}

const photos = (photosFile.photos ?? []).filter((photo) => isPublish(photo.tags));
const texts = (textsFile.texts ?? []).filter((text) => isPublish(text.tags));
const photoIds = new Set(photos.map((photo) => photo.id));
const textIds = new Set(texts.map((text) => text.id));
const items = (textsFile.items ?? []).filter((ref) =>
  ref?.type === "photo" ? photoIds.has(ref.id) : textIds.has(ref.id),
);
for (const photo of photos) {
  if (!items.some((ref) => ref.type === "photo" && ref.id === photo.id)) {
    items.push({ type: "photo", id: photo.id });
  }
}
for (const text of texts) {
  if (!items.some((ref) => ref.type === "text" && ref.id === text.id)) {
    items.push({ type: "text", id: text.id });
  }
}

const publicPhotos = photos.map((photo) => ({
  ...photo,
  files: {
    display: `images/display/${photo.id}.${ext(photo.files?.display)}`,
    thumb: `images/thumbs/${photo.id}.${ext(photo.files?.thumb)}`,
  },
}));

await mkdir(join(dest, "data"), { recursive: true });
await rm(join(dest, "images", "display"), { recursive: true, force: true });
await rm(join(dest, "images", "thumbs"), { recursive: true, force: true });
await mkdir(join(dest, "images", "display"), { recursive: true });
await mkdir(join(dest, "images", "thumbs"), { recursive: true });
await mkdir(join(dest, "images", "covers"), { recursive: true });

let copied = 0;
for (const photo of photos) {
  const pub = publicPhotos.find((item) => item.id === photo.id);
  const displaySrc = join(workspace, photo.files.display);
  const thumbSrc = join(workspace, photo.files.thumb);
  if (!existsSync(displaySrc) || !existsSync(thumbSrc)) {
    console.warn(`Übersprungen (Datei fehlt): ${photo.originalName || photo.id}`);
    continue;
  }
  await copyTo(displaySrc, join(dest, pub.files.display));
  await copyTo(thumbSrc, join(dest, pub.files.thumb));
  copied += 1;
}

async function copyCover(cover) {
  if (!cover || typeof cover !== "string") return;
  const rel = cover.replace(/^\/+/, "");
  const candidates = [join(workspace, rel), join(workspace, "derived", rel), join(dest, rel)];
  const from = candidates.find((path) => existsSync(path));
  if (!from) return;
  await copyTo(from, join(dest, rel));
}

async function walkPages(pages) {
  if (!Array.isArray(pages)) return;
  for (const page of pages) {
    if (page?.cover) await copyCover(page.cover);
    if (Array.isArray(page?.children)) await walkPages(page.children);
  }
}
await walkPages(site.pages);

await writeFile(join(dest, "data", "photos.json"), `${JSON.stringify({ version: 1, photos: publicPhotos }, null, 2)}\n`);
await writeFile(join(dest, "data", "tags.json"), `${JSON.stringify(tags, null, 2)}\n`);
await writeFile(join(dest, "data", "site.json"), `${JSON.stringify(site, null, 2)}\n`);
await writeFile(
  join(dest, "data", "texts.json"),
  `${JSON.stringify({ version: 1, texts, items }, null, 2)}\n`,
);

console.log(`public/: ${copied} veröffentlichte Bilder aus ${workspace}`);
