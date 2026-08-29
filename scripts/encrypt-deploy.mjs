import { randomBytes } from "node:crypto";
import { readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

const MAGIC = Buffer.from([0x43, 0x32, 0x45, 0x31]); // C2E1
const ITERATIONS = 120_000;
const IV_LENGTH = 12;
const VERIFIER = "c2-gallery-ok";

function bytesToBase64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

function toArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

async function deriveKey(password, salt, iterations) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: toArrayBuffer(salt), iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
}

async function encryptBytes(key, data) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: toArrayBuffer(iv) }, key, toArrayBuffer(data)),
  );
  const out = new Uint8Array(MAGIC.length + iv.length + cipher.length);
  out.set(MAGIC, 0);
  out.set(iv, MAGIC.length);
  out.set(cipher, MAGIC.length + iv.length);
  return Buffer.from(out);
}

function catalogBootstrap(catalog) {
  const json = JSON.stringify({
    tags: catalog.tags,
    photos: catalog.photos,
    site: catalog.site,
    texts: catalog.texts,
    filters: catalog.filters,
  }).replace(/</g, "\\u003c");
  return `window.__C2_CATALOG__=${json};`;
}

function injectCatalog(html, bootstrap) {
  const tag = `<script id="c2-catalog">${bootstrap}</script>`;
  const stripped = html.replace(/<script id="c2-catalog">[\s\S]*?<\/script>/, "");
  if (stripped.includes("<head>")) return stripped.replace("<head>", `<head>${tag}`);
  if (stripped.includes("<body")) return stripped.replace(/<body([^>]*)>/, `<body$1>${tag}`);
  return `${tag}${stripped}`;
}

async function listFiles(dir, prefix = "") {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await listFiles(join(dir, entry.name), rel)));
    else out.push(rel);
  }
  return out;
}

const dest = process.argv[2];
const password = (process.argv[3] || process.env.C2_GALLERY_PASSWORD || "").trim();
if (!dest || !password) {
  console.error("Usage: node scripts/encrypt-deploy.mjs <deploy-dir> <password>");
  process.exit(1);
}

const photos = JSON.parse(await readFile(join(dest, "data/photos.json"), "utf8"));
const site = JSON.parse(await readFile(join(dest, "data/site.json"), "utf8"));
const tags = JSON.parse(await readFile(join(dest, "data/tags.json"), "utf8"));
const texts = JSON.parse(await readFile(join(dest, "data/texts.json"), "utf8"));
let filters = { version: 1, filters: [] };
try {
  filters = JSON.parse(await readFile(join(dest, "data/filters.json"), "utf8"));
} catch {
  /* optional */
}

const salt = randomBytes(16);
const key = await deriveKey(password, salt, ITERATIONS);
const verifier = bytesToBase64(await encryptBytes(key, Buffer.from(VERIFIER)));

site.protection = {
  watermark: Boolean(site.protection?.watermark),
  watermarkText: site.protection?.watermarkText ?? "",
  passwordProtect: false,
  crypto: {
    salt: bytesToBase64(salt),
    iterations: ITERATIONS,
    verifier,
  },
};

for (const photo of photos.photos) {
  for (const kind of ["display", "thumb"]) {
    const rel = photo.files[kind];
    const abs = join(dest, rel);
    const plain = new Uint8Array(await readFile(abs));
    const encrypted = await encryptBytes(key, plain);
    const next = `images/${kind === "thumb" ? "thumbs" : "display"}/${photo.id}.c2`;
    await writeFile(join(dest, next), encrypted);
    if (rel !== next) {
      try {
        await unlink(abs);
      } catch {
        /* already gone */
      }
    }
    photo.files[kind] = next;
  }
}

const leftover = (await listFiles(join(dest, "images"))).filter((path) => !path.endsWith(".c2"));
for (const path of leftover) {
  await unlink(join(dest, "images", path));
}

const published = { tags, photos, site, texts, filters };
const bootstrap = catalogBootstrap(published);
await writeFile(join(dest, "data/photos.json"), `${JSON.stringify(photos, null, 2)}\n`);
await writeFile(join(dest, "data/site.json"), `${JSON.stringify(site, null, 2)}\n`);
await writeFile(join(dest, "data/catalog.js"), `${bootstrap}\n`);
const indexHtml = await readFile(join(dest, "index.html"), "utf8");
await writeFile(join(dest, "index.html"), injectCatalog(indexHtml, bootstrap));

console.log(`Encrypted ${photos.photos.length} photos in ${dest}`);
