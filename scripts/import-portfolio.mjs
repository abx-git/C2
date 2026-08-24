import { execFile } from "node:child_process";
import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE = path.join(ROOT, ".cache", "portfolio");
const DISPLAY_DIR = path.join(ROOT, "public", "images", "display");
const THUMB_DIR = path.join(ROOT, "public", "images", "thumbs");
const COVER_DIR = path.join(ROOT, "public", "images", "covers");
const DATA_DIR = path.join(ROOT, "public", "data");
const USER = "7ba1edd9-d8ce-4483-9088-a242a4dde3fe";
const BASE = "https://xbe.myportfolio.com";

const SERIES = [
  { slug: "ai-art-2", id: "ai-art", title: "AI art", year: "2025", cover: "db1a29a7-18c3-4b89-aa79-d0402bcd8620" },
  { slug: "flying", id: "flying", title: "Flying", year: "2025", cover: "fd468dd3-25cc-4ae0-93a0-df0134758d14" },
  { slug: "aerial", id: "aerial", title: "Aerial", year: "2024", cover: "be71e453-77b5-4af5-a272-6f0257267cd5" },
  { slug: "abstract-1", id: "abstract", title: "Abstract", year: "2024", cover: "e6ee6f98-5622-4e2b-abb7-80851d32ba49" },
  { slug: "architecture-1", id: "architecture", title: "Architecture", year: "2024", cover: "53574c8d-fee0-4fa5-8757-1b8da86e6e3b" },
  { slug: "stone", id: "stone", title: "Stone", year: "2024", cover: "9c938c97-8740-4e0b-87ca-c023369f43a6" },
  { slug: "stations", id: "stations", title: "Stations", year: "2024", cover: "42460f05-fb40-41ab-b5d6-173bd3bf8a8e" },
  { slug: "reduced", id: "reduced", title: "Reduced", year: "2024", cover: "75443449-6bfa-4894-89c5-9c6a574861f9" },
  { slug: "nature", id: "nature", title: "Nature", year: "2024", cover: "ba18133e-40f1-4262-bc7c-5aa29c7057f3" },
  { slug: "moor", id: "moor", title: "Moor", year: "2024", cover: "50489178-87fb-43a1-961c-bdf8949f9865" },
  { slug: "landscapes", id: "landscapes", title: "Landscapes", year: "2024", cover: "e2237f28-dc29-413c-b14f-5754af3ad295" },
  { slug: "hamburg-1", id: "hamburg", title: "Hamburg", year: "2024", cover: "186e5226-f231-470a-a681-f82d917c4bef" },
  { slug: "forms", id: "forms", title: "Forms", year: "2024", cover: "fb682f8e-b013-4253-bafe-e58f7478f847" },
  { slug: "beach", id: "beach", title: "Beach", year: "2024", cover: "62193494-fdb8-4ade-81da-e0dbc81363ac" },
];

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { "user-agent": "C2-import/1.0" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

async function download(url, dest) {
  if (await exists(dest)) return;
  const res = await fetch(url, { headers: { "user-agent": "C2-import/1.0" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

function pickLargest(srcset) {
  const items = [...srcset.matchAll(/(https:\/\/cdn\.myportfolio\.com\/[^,\s]+)\s+(\d+)w/g)].map((m) => ({
    url: m[1],
    w: Number(m[2]),
  }));
  items.sort((a, b) => b.w - a.w);
  return items[0]?.url ?? null;
}

function imageIdFromUrl(url) {
  const match = url.match(/\/([0-9a-f-]{36})_/i);
  return match?.[1] ?? null;
}

function extractImages(html) {
  const seen = new Set();
  const images = [];
  const blocks = html.split(/class="js-lightbox-slide-content"/);
  for (const block of blocks.slice(1)) {
    const srcset = block.match(/data-srcset="([^"]+)"/)?.[1] ?? block.match(/srcset="([^"]+)"/)?.[1] ?? "";
    const src = block.match(/data-src="([^"]+)"/)?.[1] ?? block.match(/src="(https:\/\/cdn\.myportfolio\.com\/[^"]+)"/)?.[1];
    const url = pickLargest(srcset) ?? src;
    if (!url) continue;
    const id = imageIdFromUrl(url);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    images.push({ id, url });
  }
  return images;
}

function coverUrlFromWork(html, id) {
  const match = html.match(new RegExp(`https://cdn\\.myportfolio\\.com/${USER}/${id}_carw_4x3x1280\\.jpg\\?h=[0-9a-f]+`));
  return match?.[0] ?? null;
}

async function sipsSize(file) {
  const { stdout } = await execFileAsync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", file]);
  const width = Number(/pixelWidth:\s+(\d+)/.exec(stdout)?.[1] ?? 0);
  const height = Number(/pixelHeight:\s+(\d+)/.exec(stdout)?.[1] ?? 0);
  return { width, height };
}

async function sipsResize(src, dest, maxEdge) {
  if (await exists(dest)) return;
  await execFileAsync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "84", "-Z", String(maxEdge), src, "--out", dest]);
}

async function mapPool(items, limit, fn) {
  const out = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const index = i++;
      out[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const years = [...new Set(SERIES.map((s) => s.year))];

async function main() {
  await mkdir(CACHE, { recursive: true });
  await mkdir(DISPLAY_DIR, { recursive: true });
  await mkdir(THUMB_DIR, { recursive: true });
  await mkdir(COVER_DIR, { recursive: true });
  await mkdir(DATA_DIR, { recursive: true });

  const workHtml = await fetchText(`${BASE}/work`);
  const photos = [];
  const tags = [];
  const groups = years.map((year) => ({
    id: `year-${year}`,
    type: "group",
    title: year,
    children: [],
  }));

  for (const series of SERIES) {
    process.stdout.write(`\n${series.title} ${series.year}\n`);
    const html = await fetchText(`${BASE}/${series.slug}`);
    const images = extractImages(html);
    console.log(`  ${images.length} Bilder`);

    tags.push({ id: series.id, name: series.title, slug: series.id });
    groups.find((g) => g.title === series.year).children.push({
      id: series.id,
      type: "gallery",
      title: series.title,
      year: series.year,
      cover: `images/covers/${series.id}.jpg`,
      filter: { tags: [series.id] },
    });

    const coverSrc = path.join(CACHE, `cover-${series.id}.jpg`);
    const coverDest = path.join(COVER_DIR, `${series.id}.jpg`);
    const coverHref = coverUrlFromWork(workHtml, series.cover);
    try {
      if (coverHref) await download(coverHref, coverSrc);
      if ((await exists(coverSrc)) && !(await exists(coverDest))) {
        await execFileAsync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "84", coverSrc, "--out", coverDest]);
      }
    } catch (error) {
      console.warn(`  Cover fehlgeschlagen: ${error.message}`);
    }

    await mapPool(images, 4, async (image, index) => {
      const raw = path.join(CACHE, `${image.id}.jpg`);
      const display = path.join(DISPLAY_DIR, `${image.id}.jpg`);
      const thumb = path.join(THUMB_DIR, `${image.id}.jpg`);
      try {
        await download(image.url, raw);
        await sipsResize(raw, display, 2048);
        await sipsResize(raw, thumb, 400);
        const size = await sipsSize(display);
        photos.push({
          id: image.id,
          originalName: `${series.id}-${String(index + 1).padStart(2, "0")}.jpg`,
          title: "",
          caption: "",
          takenAt: `${series.year}-01-01`,
          tags: [series.id],
          files: {
            display: `images/display/${image.id}.jpg`,
            thumb: `images/thumbs/${image.id}.jpg`,
          },
          width: size.width || 1,
          height: size.height || 1,
        });
        process.stdout.write(".");
      } catch (error) {
        console.warn(`\n  ${image.id}: ${error.message}`);
      }
    });
  }

  const site = {
    version: 1,
    title: "Andreas Bergmann",
    theme: "gallery-v1",
    contactEmail: "",
    layout: {
      gap: 8,
      columns: "mix",
      rowMinHeight: 160,
      rowMaxHeight: 440,
      showPageTitle: true,
    },
    pages: [
      { id: "work", type: "work", title: "Work" },
      ...groups,
      { id: "contact", type: "contact", title: "Contact" },
    ],
  };

  await writeFile(path.join(DATA_DIR, "photos.json"), `${JSON.stringify({ version: 1, photos }, null, 2)}\n`);
  await writeFile(path.join(DATA_DIR, "tags.json"), `${JSON.stringify({ version: 1, tags }, null, 2)}\n`);
  await writeFile(path.join(DATA_DIR, "site.json"), `${JSON.stringify(site, null, 2)}\n`);
  console.log(`\n\nFertig: ${photos.length} Bilder, ${tags.length} Serien`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
