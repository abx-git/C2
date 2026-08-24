import { newId } from "./id";
import { uniqueSlug } from "./slug";

export const CATALOG_VERSION = 1 as const;

export type Tag = {
  id: string;
  name: string;
  slug: string;
};

export const PUBLISH_TAG_ID = "publish";
export const PUBLISH_TAG: Tag = { id: PUBLISH_TAG_ID, name: "publish", slug: "publish" };

export function isPublishTag(tag: Pick<Tag, "id" | "slug"> | string): boolean {
  if (typeof tag === "string") return tag === PUBLISH_TAG_ID || tag === "publish";
  return tag.id === PUBLISH_TAG_ID || tag.slug === "publish";
}

export function ensurePublishTag(tags: Tag[]): Tag[] {
  if (tags.some((tag) => isPublishTag(tag))) {
    return tags;
  }
  return [PUBLISH_TAG, ...tags];
}

export type TagsFile = {
  version: typeof CATALOG_VERSION;
  tags: Tag[];
};

export type PhotoExif = {
  camera?: string;
  focalLength?: string;
};

export type PhotoFiles = {
  original?: string;
  display: string;
  thumb: string;
};

export type Photo = {
  id: string;
  originalName: string;
  title: string;
  caption: string;
  takenAt: string | null;
  tags: string[];
  files: PhotoFiles;
  width: number;
  height: number;
  exif?: PhotoExif;
};

export type PhotosFile = {
  version: typeof CATALOG_VERSION;
  photos: Photo[];
};

export type TextTile = {
  id: string;
  title: string;
  body: string;
  tags: string[];
};

export type FeedRef = {
  type: "photo" | "text";
  id: string;
};

export type TextsFile = {
  version: typeof CATALOG_VERSION;
  texts: TextTile[];
  items: FeedRef[];
};

export type FeedItem = { type: "photo"; photo: Photo } | { type: "text"; text: TextTile };

export type GalleryFilter = {
  tags: string[];
};

export type PageVisibility = "public" | "restricted" | "private";

export const DEFAULT_VISIBILITY: PageVisibility = "public";

type PageBase = {
  id: string;
  title: string;
  visibility: PageVisibility;
};

export type GalleryPage = PageBase & {
  type: "gallery";
  year?: string;
  cover?: string;
  filter: GalleryFilter;
};

export type WorkPage = PageBase & {
  type: "work";
};

export type ContactPage = PageBase & {
  type: "contact";
};

export type GroupPage = PageBase & {
  type: "group";
  children: SitePage[];
};

export type LeafPage = GalleryPage | WorkPage | ContactPage;
export type SitePage = LeafPage | GroupPage;

export type SiteTheme = "gallery-v1";

export type LayoutColumns = "1" | "2" | "3" | "4" | "5" | "6" | "mix" | "fill";

export const LAYOUT_COLUMN_OPTIONS: { id: LayoutColumns; label: string; hint: string }[] = [
  { id: "1", label: "1", hint: "Ein Bild pro Zeile" },
  { id: "2", label: "2", hint: "Zwei Bilder nebeneinander" },
  { id: "3", label: "3", hint: "Drei Bilder nebeneinander" },
  { id: "4", label: "4", hint: "Vier Bilder nebeneinander" },
  { id: "5", label: "5", hint: "Fünf Bilder nebeneinander" },
  { id: "6", label: "6", hint: "Sechs Bilder nebeneinander" },
  { id: "mix", label: "2–3", hint: "Abwechselnd zwei und drei Bilder" },
  { id: "fill", label: "Rand", hint: "So viele, bis der Rand erreicht ist" },
];

export function isLayoutColumns(value: unknown): value is LayoutColumns {
  return LAYOUT_COLUMN_OPTIONS.some((item) => item.id === value);
}

export const GALLERY_BACKGROUNDS = [
  { id: "white", label: "Weiß", bg: "#ffffff", ink: "#111111", muted: "#767676", line: "rgba(17, 17, 17, 0.12)" },
  { id: "paper", label: "Papier", bg: "#f4f1ea", ink: "#1a1916", muted: "#7a7468", line: "rgba(26, 25, 22, 0.12)" },
  { id: "gray", label: "Grau", bg: "#e8e7e4", ink: "#1a1a1a", muted: "#6e6e6a", line: "rgba(26, 26, 26, 0.14)" },
  { id: "graphite", label: "Graphit", bg: "#2a2a28", ink: "#f0efe9", muted: "#9c9a94", line: "rgba(240, 239, 233, 0.16)" },
  { id: "black", label: "Schwarz", bg: "#111111", ink: "#f5f5f3", muted: "#8e8e8a", line: "rgba(245, 245, 243, 0.16)" },
] as const;

export type GalleryBackgroundId = (typeof GALLERY_BACKGROUNDS)[number]["id"];

export function galleryBackground(id: string | undefined): (typeof GALLERY_BACKGROUNDS)[number] {
  return GALLERY_BACKGROUNDS.find((item) => item.id === id) ?? GALLERY_BACKGROUNDS[0];
}

export function galleryThemeStyle(id: string | undefined): Record<string, string> {
  const tone = galleryBackground(id);
  return {
    "--g-bg": tone.bg,
    "--g-ink": tone.ink,
    "--g-muted": tone.muted,
    "--g-line": tone.line,
  };
}

export type LayoutConfig = {
  /** Abstand zwischen Bildern, Pixel */
  gap: number;
  /** 1–6 nebeneinander, wechselnd 2/3 oder so viele, bis der rechte Rand erreicht ist */
  columns: LayoutColumns;
  /** kleinste Zeilenhöhe, Pixel */
  rowMinHeight: number;
  /** größte Zeilenhöhe, Pixel */
  rowMaxHeight: number;
  /** Serientitel über den Bildern */
  showPageTitle: boolean;
  /** Hintergrund der Galerie */
  background: GalleryBackgroundId;
};

export const DEFAULT_LAYOUT: LayoutConfig = {
  gap: 8,
  columns: "mix",
  rowMinHeight: 160,
  rowMaxHeight: 440,
  showPageTitle: true,
  background: "white",
};

export type SiteFile = {
  version: typeof CATALOG_VERSION;
  title: string;
  theme: SiteTheme;
  contactEmail?: string;
  layout: LayoutConfig;
  pages: SitePage[];
};

export type Catalog = {
  photos: PhotosFile;
  tags: TagsFile;
  site: SiteFile;
  texts: TextsFile;
};

export function emptyTags(): TagsFile {
  return { version: 1, tags: [PUBLISH_TAG] };
}

export function emptyPhotos(): PhotosFile {
  return { version: 1, photos: [] };
}

export function emptyTexts(): TextsFile {
  return { version: 1, texts: [], items: [] };
}

export function emptySite(): SiteFile {
  return {
    version: 1,
    title: "Photos",
    theme: "gallery-v1",
    contactEmail: "",
    layout: { ...DEFAULT_LAYOUT },
    pages: [
      { id: "work", type: "work", title: "Work", visibility: "public" },
      {
        id: "home",
        type: "gallery",
        title: "Alle",
        visibility: "public",
        filter: { tags: [] },
      },
      { id: "contact", type: "contact", title: "Contact", visibility: "public" },
    ],
  };
}

export function emptyCatalog(): Catalog {
  return { photos: emptyPhotos(), tags: emptyTags(), site: emptySite(), texts: emptyTexts() };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseTags(raw: unknown): TagsFile {
  if (!isRecord(raw) || !Array.isArray(raw.tags)) return emptyTags();
  const tags: Tag[] = [];
  for (const item of raw.tags) {
    if (!isRecord(item)) continue;
    const id = typeof item.id === "string" ? item.id : "";
    const name = typeof item.name === "string" ? item.name : "";
    const slug = typeof item.slug === "string" ? item.slug : "";
    if (!id || !name) continue;
    tags.push({ id, name, slug: slug || id });
  }
  return { version: 1, tags: ensurePublishTag(tags) };
}

export function parsePhotos(raw: unknown): PhotosFile {
  if (!isRecord(raw) || !Array.isArray(raw.photos)) return emptyPhotos();
  const photos: Photo[] = [];
  for (const item of raw.photos) {
    if (!isRecord(item)) continue;
    const id = typeof item.id === "string" ? item.id : "";
    const files = isRecord(item.files) ? item.files : null;
    const display = files && typeof files.display === "string" ? files.display : "";
    const thumb = files && typeof files.thumb === "string" ? files.thumb : "";
    if (!id || !display || !thumb) continue;
    const original = files && typeof files.original === "string" ? files.original : undefined;
    const exif = isRecord(item.exif)
      ? {
          camera: typeof item.exif.camera === "string" ? item.exif.camera : undefined,
          focalLength: typeof item.exif.focalLength === "string" ? item.exif.focalLength : undefined,
        }
      : undefined;
    photos.push({
      id,
      originalName: typeof item.originalName === "string" ? item.originalName : id,
      title: typeof item.title === "string" ? item.title : "",
      caption: typeof item.caption === "string" ? item.caption : "",
      takenAt: typeof item.takenAt === "string" ? item.takenAt : null,
      tags: Array.isArray(item.tags) ? item.tags.filter((t): t is string => typeof t === "string") : [],
      files: { original, display, thumb },
      width: typeof item.width === "number" ? item.width : 1,
      height: typeof item.height === "number" ? item.height : 1,
      exif,
    });
  }
  return { version: 1, photos };
}

export function parseTexts(raw: unknown): TextsFile {
  if (!isRecord(raw)) return emptyTexts();
  const texts: TextTile[] = [];
  if (Array.isArray(raw.texts)) {
    for (const item of raw.texts) {
      if (!isRecord(item)) continue;
      const id = typeof item.id === "string" ? item.id : "";
      if (!id) continue;
      texts.push({
        id,
        title: typeof item.title === "string" ? item.title : "",
        body: typeof item.body === "string" ? item.body : "",
        tags: Array.isArray(item.tags) ? item.tags.filter((t): t is string => typeof t === "string") : [],
      });
    }
  }
  const items: FeedRef[] = [];
  if (Array.isArray(raw.items)) {
    for (const item of raw.items) {
      if (!isRecord(item)) continue;
      const id = typeof item.id === "string" ? item.id : "";
      if (!id) continue;
      if (item.type === "photo" || item.type === "text") items.push({ type: item.type, id });
    }
  }
  return { version: 1, texts, items };
}

export function normalizeItems(photos: Photo[], texts: TextTile[], items: FeedRef[]): FeedRef[] {
  const photoIds = new Set(photos.map((photo) => photo.id));
  const textIds = new Set(texts.map((text) => text.id));
  const seen = new Set<string>();
  const next: FeedRef[] = [];
  for (const ref of items) {
    const ok = ref.type === "photo" ? photoIds.has(ref.id) : textIds.has(ref.id);
    const key = `${ref.type}:${ref.id}`;
    if (!ok || seen.has(key)) continue;
    seen.add(key);
    next.push(ref);
  }
  for (const photo of photos) {
    const key = `photo:${photo.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push({ type: "photo", id: photo.id });
  }
  for (const text of texts) {
    const key = `text:${text.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push({ type: "text", id: text.id });
  }
  return next;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function parseLayout(raw: unknown): LayoutConfig {
  const base = { ...DEFAULT_LAYOUT };
  if (!isRecord(raw)) return base;
  if (typeof raw.gap === "number" && Number.isFinite(raw.gap)) base.gap = clamp(Math.round(raw.gap), 0, 64);
  if (isLayoutColumns(raw.columns)) base.columns = raw.columns;
  if (typeof raw.rowMinHeight === "number" && Number.isFinite(raw.rowMinHeight)) {
    base.rowMinHeight = clamp(Math.round(raw.rowMinHeight), 80, 600);
  }
  if (typeof raw.rowMaxHeight === "number" && Number.isFinite(raw.rowMaxHeight)) {
    base.rowMaxHeight = clamp(Math.round(raw.rowMaxHeight), 120, 900);
  }
  if (base.rowMaxHeight < base.rowMinHeight) base.rowMaxHeight = base.rowMinHeight;
  if (typeof raw.showPageTitle === "boolean") base.showPageTitle = raw.showPageTitle;
  if (typeof raw.background === "string" && GALLERY_BACKGROUNDS.some((item) => item.id === raw.background)) {
    base.background = raw.background as GalleryBackgroundId;
  }
  return base;
}

export function parseSite(raw: unknown): SiteFile {
  if (!isRecord(raw)) return emptySite();
  const pages = Array.isArray(raw.pages) ? raw.pages.map(parsePage).filter((p): p is SitePage => p !== null) : [];
  return {
    version: 1,
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title : "Photos",
    theme: raw.theme === "gallery-v1" ? "gallery-v1" : "gallery-v1",
    contactEmail: typeof raw.contactEmail === "string" ? raw.contactEmail : "",
    layout: parseLayout(raw.layout),
    pages: pages.length ? pages : emptySite().pages,
  };
}

export function parseVisibility(raw: unknown): PageVisibility {
  if (raw === "public" || raw === "restricted" || raw === "private") return raw;
  return DEFAULT_VISIBILITY;
}

export function pageVisibility(page: SitePage): PageVisibility {
  return page.visibility ?? DEFAULT_VISIBILITY;
}

export function tighterVisibility(a: PageVisibility, b: PageVisibility): PageVisibility {
  const rank: Record<PageVisibility, number> = { public: 0, restricted: 1, private: 2 };
  return rank[a] >= rank[b] ? a : b;
}

export function withInheritedVisibility(pages: SitePage[], parent: PageVisibility = "public"): SitePage[] {
  return pages.map((page) => {
    const visibility = tighterVisibility(parent, pageVisibility(page));
    if (page.type === "group") {
      return { ...page, visibility, children: withInheritedVisibility(page.children, visibility) };
    }
    return { ...page, visibility };
  });
}

export function stripPrivatePages(pages: SitePage[]): SitePage[] {
  const out: SitePage[] = [];
  for (const page of pages) {
    if (pageVisibility(page) === "private") continue;
    if (page.type === "group") {
      out.push({ ...page, children: stripPrivatePages(page.children) });
    } else {
      out.push(page);
    }
  }
  return out;
}

export function navPages(pages: SitePage[]): SitePage[] {
  const out: SitePage[] = [];
  for (const page of pages) {
    if (pageVisibility(page) !== "public") continue;
    if (page.type === "group") {
      const children = navPages(page.children);
      if (!children.length) continue;
      out.push({ ...page, children });
    } else {
      out.push(page);
    }
  }
  return out;
}

function parsePage(raw: unknown): SitePage | null {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id : "";
  const title = typeof raw.title === "string" ? raw.title : "";
  if (!id || !title) return null;
  const visibility = parseVisibility(raw.visibility);
  if (raw.type === "group") {
    const children = Array.isArray(raw.children)
      ? raw.children.map(parsePage).filter((p): p is SitePage => p !== null)
      : [];
    return { id, type: "group", title, visibility, children };
  }
  if (raw.type === "work") return { id, type: "work", title, visibility };
  if (raw.type === "contact") return { id, type: "contact", title, visibility };
  const filterTags =
    isRecord(raw.filter) && Array.isArray(raw.filter.tags)
      ? raw.filter.tags.filter((t): t is string => typeof t === "string")
      : [];
  const year = typeof raw.year === "string" && raw.year.trim() ? raw.year.trim() : undefined;
  const cover = typeof raw.cover === "string" && raw.cover.trim() ? raw.cover.trim() : undefined;
  return { id, type: "gallery", title, visibility, year, cover, filter: { tags: filterTags } };
}

export function parseCatalog(tagsRaw: unknown, photosRaw: unknown, siteRaw: unknown, textsRaw?: unknown): Catalog {
  const photos = parsePhotos(photosRaw);
  const texts = parseTexts(textsRaw);
  return {
    tags: parseTags(tagsRaw),
    photos,
    texts: { version: 1, texts: texts.texts, items: normalizeItems(photos.photos, texts.texts, texts.items) },
    site: parseSite(siteRaw),
  };
}

export function createTag(name: string, existing: Tag[]): Tag {
  const ids = new Set(existing.map((t) => t.id));
  const slugs = new Set(existing.map((t) => t.slug));
  const slug = uniqueSlug(name, slugs);
  let id = slug;
  if (ids.has(id)) id = newId();
  return { id, name: name.trim(), slug };
}

function tagAliases(tag: Tag): string[] {
  return [tag.id, tag.slug, tag.name];
}

function photoHasTag(item: { tags: string[] }, required: string, tags: Tag[]): boolean {
  if (item.tags.includes(required)) return true;
  const def = tags.find((tag) => tagAliases(tag).includes(required));
  if (!def) return false;
  return item.tags.some((assigned) => tagAliases(def).includes(assigned));
}

export function hasCatalogTag(item: { tags: string[] }, tagId: string, tags: Tag[]): boolean {
  return photoHasTag(item, tagId, tags);
}

/** Seite mit Tags: Foto muss jeden angegebenen Tag haben. Ohne Tags: alle Fotos. */
export function filterPhotos(photos: Photo[], filter: GalleryFilter, tags: Tag[] = []): Photo[] {
  if (!filter?.tags?.length) return photos;
  return photos.filter((photo) => filter.tags.every((required) => photoHasTag(photo, required, tags)));
}

export function photoIsPublished(photo: Photo, tags: Tag[] = []): boolean {
  return photoHasTag(photo, PUBLISH_TAG_ID, tags);
}

export function publishedPhotos(photos: Photo[], tags: Tag[] = []): Photo[] {
  return photos.filter((photo) => photoIsPublished(photo, tags));
}

export function catalogFeed(catalog: Catalog, filter?: GalleryFilter): FeedItem[] {
  const textsFile = catalog.texts ?? emptyTexts();
  const photos = new Map(catalog.photos.photos.map((photo) => [photo.id, photo]));
  const texts = new Map(textsFile.texts.map((text) => [text.id, text]));
  const items = normalizeItems(catalog.photos.photos, textsFile.texts, textsFile.items);
  const out: FeedItem[] = [];
  for (const ref of items) {
    if (ref.type === "photo") {
      const photo = photos.get(ref.id);
      if (!photo) continue;
      if (filter?.tags.length && !filter.tags.every((required) => photoHasTag(photo, required, catalog.tags.tags))) {
        continue;
      }
      out.push({ type: "photo", photo });
    } else {
      const text = texts.get(ref.id);
      if (!text) continue;
      if (filter?.tags.length && !filter.tags.every((required) => photoHasTag(text, required, catalog.tags.tags))) {
        continue;
      }
      out.push({ type: "text", text });
    }
  }
  return out;
}

/** Öffentliche Galerie und Deploy: nur Einträge mit Tag publish. */
export function toPublicCatalog(catalog: Catalog): Catalog {
  const tags = ensurePublishTag(catalog.tags.tags);
  const textsFile = catalog.texts ?? emptyTexts();
  const photos = publishedPhotos(catalog.photos.photos, tags);
  const texts = textsFile.texts.filter((text) => photoHasTag(text, PUBLISH_TAG_ID, tags));
  return {
    ...catalog,
    tags: { version: 1, tags },
    photos: { version: 1, photos },
    texts: { version: 1, texts, items: normalizeItems(photos, texts, textsFile.items) },
    site: {
      ...catalog.site,
      pages: stripPrivatePages(withInheritedVisibility(catalog.site.pages)),
    },
  };
}

function fileExt(path: string): string {
  const match = path.match(/\.([a-z0-9]+)$/i);
  return match?.[1]?.toLowerCase() ?? "webp";
}

export function publicPhotoFiles(photo: Photo): PhotoFiles {
  return {
    display: `images/display/${photo.id}.${fileExt(photo.files.display)}`,
    thumb: `images/thumbs/${photo.id}.${fileExt(photo.files.thumb)}`,
  };
}

export function toPublicPhotos(photos: PhotosFile): PhotosFile {
  return {
    version: 1,
    photos: photos.photos.map((photo) => ({
      ...photo,
      files: publicPhotoFiles(photo),
    })),
  };
}

export function flattenGalleryPages(pages: SitePage[]): GalleryPage[] {
  const out: GalleryPage[] = [];
  for (const page of pages) {
    if (page.type === "gallery") out.push(page);
    else if (page.type === "group") out.push(...flattenGalleryPages(page.children));
  }
  return out;
}

export function flattenLeafPages(pages: SitePage[]): LeafPage[] {
  const out: LeafPage[] = [];
  for (const page of pages) {
    if (page.type === "group") out.push(...flattenLeafPages(page.children));
    else out.push(page);
  }
  return out;
}

export function findPage(pages: SitePage[], id: string): SitePage | null {
  for (const page of pages) {
    if (page.id === id) return page;
    if (page.type === "group") {
      const found = findPage(page.children, id);
      if (found) return found;
    }
  }
  return null;
}

export function tagInUse(tagId: string, photos: Photo[], texts: TextTile[] = []): boolean {
  return photos.some((photo) => photo.tags.includes(tagId)) || texts.some((text) => text.tags.includes(tagId));
}
