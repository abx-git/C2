import { newId } from "./id";
import { uniqueSlug } from "./slug";
import {
  cloneFilterSpec,
  emptyFilterSpec,
  isEmptyFilterSpec,
  parseFilterOrder,
  parseFilters,
  parseFilterSpec,
  specFromLegacyTags,
  stripTagFromSpec,
  type SavedFilterSpec,
} from "./saved-filter";

export type { FilterMode, SavedFilterSpec } from "./saved-filter";
export {
  cloneFilterSpec,
  cycleSpecTag,
  cycleSpecUntagged,
  emptyFilterSpec,
  isEmptyFilterSpec,
  specFromLegacyTags,
  stripTagFromSpec,
  toggleSpecRating,
} from "./saved-filter";

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

export type PhotoGeo = {
  lat: number;
  lng: number;
};

export function parsePhotoGeo(raw: unknown): PhotoGeo | undefined {
  if (!isRecord(raw)) return undefined;
  const lat = typeof raw.lat === "number" ? raw.lat : Number(raw.lat);
  const lng = typeof raw.lng === "number" ? raw.lng : Number(raw.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return undefined;
  if (lat === 0 && lng === 0) return undefined;
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}

export function photoHasGeo(photo: Pick<Photo, "geo">): photo is Photo & { geo: PhotoGeo } {
  return Boolean(photo.geo);
}

export type PhotoFiles = {
  original?: string;
  display: string;
  thumb: string;
};

export const PHOTO_RATING_MIN = 0;
export const PHOTO_RATING_MAX = 5;

export function clampPhotoRating(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(PHOTO_RATING_MAX, Math.max(PHOTO_RATING_MIN, Math.round(value)));
}

export type Photo = {
  id: string;
  originalName: string;
  title: string;
  caption: string;
  takenAt: string | null;
  tags: string[];
  /** 0 = keine Bewertung, 1–5 Sterne */
  rating: number;
  files: PhotoFiles;
  width: number;
  height: number;
  exif?: PhotoExif;
  geo?: PhotoGeo;
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

export type GalleryFilter = SavedFilterSpec & {
  /** Eigene Reihenfolge dieser Seite. Fehlt sie, gilt die allgemeine Sortierung. */
  order?: string[];
  /** Alte Kataloge: Verweis auf filters.json. Wird beim Laden in die Seite übernommen. */
  filterId?: string;
};

export function emptyGalleryFilter(): GalleryFilter {
  return emptyFilterSpec();
}

export function galleryFilterSpec(filter: GalleryFilter | undefined): SavedFilterSpec {
  const spec = filter ?? emptyFilterSpec();
  return {
    tags: spec.tags ?? {},
    untagged: spec.untagged ?? null,
    ratings: spec.ratings ?? [],
    query: spec.query ?? "",
  };
}

export function hasPageOrder(filter: Pick<GalleryFilter, "order"> | null | undefined): boolean {
  return Array.isArray(filter?.order);
}

export function withPageFilterSpec(filter: GalleryFilter, spec: SavedFilterSpec): GalleryFilter {
  return {
    ...galleryFilterSpec(spec),
    ...(hasPageOrder(filter) ? { order: filter.order } : {}),
  };
}

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
  /** Foto-ID für die Work-Übersicht */
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
  /** Foto-ID für die Work-Übersicht */
  cover?: string;
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

export const SLIDESHOW_INTERVAL_MIN = 2;
export const SLIDESHOW_INTERVAL_MAX = 30;
export const FADE_IN_DURATION_MIN = 0.2;
export const FADE_IN_DURATION_MAX = 2;

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
  /** Diashow: Sekunden pro Bild */
  slideshowInterval: number;
  /** Bilder sanft einblenden (Übersicht und Diashow) */
  fadeIn: boolean;
  /** Einblend-Dauer in Sekunden */
  fadeInDuration: number;
};

export const DEFAULT_LAYOUT: LayoutConfig = {
  gap: 8,
  columns: "mix",
  rowMinHeight: 160,
  rowMaxHeight: 440,
  showPageTitle: true,
  background: "white",
  slideshowInterval: 5,
  fadeIn: true,
  fadeInDuration: 0.6,
};

export function clampSlideshowInterval(value: number): number {
  return Math.min(SLIDESHOW_INTERVAL_MAX, Math.max(SLIDESHOW_INTERVAL_MIN, Math.round(value)));
}

export function clampFadeInDuration(value: number): number {
  return Math.min(FADE_IN_DURATION_MAX, Math.max(FADE_IN_DURATION_MIN, Math.round(value * 10) / 10));
}

export type ProtectionCrypto = {
  salt: string;
  iterations: number;
  verifier: string;
};

export type SiteProtection = {
  watermark: boolean;
  watermarkText: string;
  passwordProtect: boolean;
  crypto?: ProtectionCrypto;
};

export const DEFAULT_PROTECTION: SiteProtection = {
  watermark: false,
  watermarkText: "",
  passwordProtect: false,
};

export const ENCRYPTED_IMAGE_EXT = "c2";

export type SiteFile = {
  version: typeof CATALOG_VERSION;
  title: string;
  theme: SiteTheme;
  contactEmail?: string;
  layout: LayoutConfig;
  protection: SiteProtection;
  pages: SitePage[];
};

export const GALLERY_SECRET_PATH = "data/gallery-secret.json";

export function parseGallerySecret(raw: unknown): string {
  if (!isRecord(raw)) return "";
  return typeof raw.password === "string" ? raw.password : "";
}

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
    protection: { ...DEFAULT_PROTECTION },
    pages: [
      { id: "work", type: "work", title: "Work", visibility: "public" },
      {
        id: "home",
        type: "gallery",
        title: "Alle",
        visibility: "public",
        filter: emptyGalleryFilter(),
      },
      { id: "contact", type: "contact", title: "Contact", visibility: "public" },
    ],
  };
}

export function emptyCatalog(): Catalog {
  return {
    photos: emptyPhotos(),
    tags: emptyTags(),
    site: emptySite(),
    texts: emptyTexts(),
  };
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
    const geo = parsePhotoGeo(item.geo);
    photos.push({
      id,
      originalName: typeof item.originalName === "string" ? item.originalName : id,
      title: typeof item.title === "string" ? item.title : "",
      caption: typeof item.caption === "string" ? item.caption : "",
      takenAt: typeof item.takenAt === "string" ? item.takenAt : null,
      tags: Array.isArray(item.tags) ? item.tags.filter((t): t is string => typeof t === "string") : [],
      rating: clampPhotoRating(typeof item.rating === "number" ? item.rating : 0),
      files: { original, display, thumb },
      width: typeof item.width === "number" ? item.width : 1,
      height: typeof item.height === "number" ? item.height : 1,
      exif,
      ...(geo ? { geo } : {}),
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
  if (typeof raw.slideshowInterval === "number" && Number.isFinite(raw.slideshowInterval)) {
    base.slideshowInterval = clampSlideshowInterval(raw.slideshowInterval);
  }
  if (typeof raw.fadeIn === "boolean") base.fadeIn = raw.fadeIn;
  if (typeof raw.fadeInDuration === "number" && Number.isFinite(raw.fadeInDuration)) {
    base.fadeInDuration = clampFadeInDuration(raw.fadeInDuration);
  }
  return base;
}

export function parseProtectionCrypto(raw: unknown): ProtectionCrypto | undefined {
  if (!isRecord(raw)) return undefined;
  const salt = typeof raw.salt === "string" ? raw.salt : "";
  const verifier = typeof raw.verifier === "string" ? raw.verifier : "";
  const iterations = typeof raw.iterations === "number" && Number.isFinite(raw.iterations) ? Math.round(raw.iterations) : 0;
  if (!salt || !verifier || iterations < 1) return undefined;
  return { salt, iterations, verifier };
}

export function parseProtection(raw: unknown): SiteProtection {
  if (!isRecord(raw)) return { ...DEFAULT_PROTECTION };
  return {
    watermark: raw.watermark === true,
    watermarkText: typeof raw.watermarkText === "string" ? raw.watermarkText : "",
    passwordProtect: raw.passwordProtect === true,
    crypto: parseProtectionCrypto(raw.crypto),
  };
}

export function editorProtection(protection: SiteProtection | undefined): SiteProtection {
  const next = parseProtection(protection);
  return {
    watermark: next.watermark,
    watermarkText: next.watermarkText,
    passwordProtect: next.passwordProtect,
  };
}

export function watermarkLabel(protection: SiteProtection | undefined, title: string): string {
  const custom = protection?.watermarkText.trim();
  return custom || title.trim() || "Photos";
}

export function hasGalleryCrypto(site: SiteFile): boolean {
  return Boolean(parseProtectionCrypto(site.protection?.crypto));
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
    protection: parseProtection(raw.protection),
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
    const cover = typeof raw.cover === "string" && raw.cover.trim() ? raw.cover.trim() : undefined;
    return { id, type: "group", title, visibility, children, cover };
  }
  if (raw.type === "work") return { id, type: "work", title, visibility };
  if (raw.type === "contact") return { id, type: "contact", title, visibility };
  const year = typeof raw.year === "string" && raw.year.trim() ? raw.year.trim() : undefined;
  const cover = typeof raw.cover === "string" && raw.cover.trim() ? raw.cover.trim() : undefined;
  return { id, type: "gallery", title, visibility, year, cover, filter: parseGalleryFilter(raw.filter) };
}

function parseGalleryFilter(raw: unknown): GalleryFilter {
  if (!isRecord(raw)) return emptyGalleryFilter();
  const filterId =
    typeof raw.filterId === "string" && raw.filterId.trim() ? raw.filterId.trim() : undefined;
  const order = parseFilterOrder(raw.order);
  let spec: SavedFilterSpec;
  if (isRecord(raw.spec)) {
    spec = parseFilterSpec(raw.spec);
  } else if (Array.isArray(raw.tags)) {
    spec = specFromLegacyTags(raw.tags.filter((item): item is string => typeof item === "string" && item.length > 0));
  } else {
    spec = parseFilterSpec(raw);
  }
  return {
    ...spec,
    ...(order ? { order } : {}),
    ...(filterId ? { filterId } : {}),
  };
}

export function parseCatalog(
  tagsRaw: unknown,
  photosRaw: unknown,
  siteRaw: unknown,
  textsRaw?: unknown,
  filtersRaw?: unknown,
): Catalog {
  const photos = parsePhotos(photosRaw);
  const texts = parseTexts(textsRaw);
  return migrateLegacyGalleryFilters(
    {
      tags: parseTags(tagsRaw),
      photos,
      texts: { version: 1, texts: texts.texts, items: normalizeItems(photos.photos, texts.texts, texts.items) },
      site: parseSite(siteRaw),
    },
    filtersRaw,
  );
}

export function rawSiteHasLegacyGalleryTags(raw: unknown): boolean {
  if (!isRecord(raw) || !Array.isArray(raw.pages)) return false;
  const walk = (pages: unknown[]): boolean => {
    for (const page of pages) {
      if (!isRecord(page)) continue;
      if (isRecord(page.filter) && typeof page.filter.filterId === "string" && page.filter.filterId.trim()) return true;
      if (isRecord(page.filter) && Array.isArray(page.filter.tags) && page.filter.tags.length > 0) return true;
      if (Array.isArray(page.children) && walk(page.children)) return true;
    }
    return false;
  };
  return walk(raw.pages);
}

function mapGalleryPages(pages: SitePage[], map: (page: GalleryPage) => GalleryPage): SitePage[] {
  return pages.map((page) => {
    if (page.type === "gallery") return map(page);
    if (page.type === "group") return { ...page, children: mapGalleryPages(page.children, map) };
    return page;
  });
}

export function updateGalleryPage(
  pages: SitePage[],
  id: string,
  map: (page: GalleryPage) => GalleryPage,
): SitePage[] {
  return mapGalleryPages(pages, (page) => (page.id === id ? map(page) : page));
}

function finalizeGalleryFilter(filter: GalleryFilter): GalleryFilter {
  const spec = galleryFilterSpec(filter);
  const order = parseFilterOrder(filter.order);
  return { ...spec, ...(order ? { order } : {}) };
}

export function migrateLegacyGalleryFilters(catalog: Catalog, filtersRaw?: unknown): Catalog {
  const saved = parseFilters(filtersRaw).filters;
  const pages = mapGalleryPages(catalog.site.pages, (page) => {
    const id = page.filter.filterId;
    if (id) {
      const match = saved.find((item) => item.id === id);
      if (match) {
        return {
          ...page,
          filter: finalizeGalleryFilter({
            ...cloneFilterSpec(match.spec),
            order: page.filter.order ?? match.order,
          }),
        };
      }
    }
    return { ...page, filter: finalizeGalleryFilter(page.filter) };
  });
  const next: Catalog = { ...catalog, site: { ...catalog.site, pages } };
  if (JSON.stringify(catalog.site.pages) === JSON.stringify(next.site.pages)) return catalog;
  return next;
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

function feedItemSearchText(item: FeedItem): string {
  if (item.type === "photo") {
    return [item.photo.title, item.photo.caption, item.photo.originalName].join("\n");
  }
  return [item.text.title, item.text.body].join("\n");
}

export function feedItemMatchesSpec(item: FeedItem, spec: SavedFilterSpec, tags: Tag[]): boolean {
  const entity = item.type === "photo" ? item.photo : item.text;
  const include: string[] = [];
  const exclude: string[] = [];
  for (const [id, mode] of Object.entries(spec.tags)) {
    if (mode === "include") include.push(id);
    else if (mode === "exclude") exclude.push(id);
  }
  if (include.length && !include.every((id) => photoHasTag(entity, id, tags))) return false;
  if (exclude.some((id) => photoHasTag(entity, id, tags))) return false;
  if (spec.untagged === "include" && entity.tags.length !== 0) return false;
  if (spec.untagged === "exclude" && entity.tags.length === 0) return false;
  if (spec.ratings.length) {
    if (item.type !== "photo") return false;
    if (!spec.ratings.includes(item.photo.rating ?? 0)) return false;
  }
  const needle = spec.query.trim().toLocaleLowerCase("de");
  if (needle && !feedItemSearchText(item).toLocaleLowerCase("de").includes(needle)) return false;
  return true;
}

export function resolvePageFilterSpec(page: GalleryPage, _catalog?: Catalog): SavedFilterSpec | undefined {
  const spec = galleryFilterSpec(page.filter);
  return isEmptyFilterSpec(spec) ? undefined : spec;
}

/** Seite mit Filter: nur passende Einträge. Ohne Filter: alle. */
export function filterPhotos(photos: Photo[], spec: SavedFilterSpec | null | undefined, tags: Tag[] = []): Photo[] {
  if (!spec || isEmptyFilterSpec(spec)) return photos;
  return photos.filter((photo) => feedItemMatchesSpec({ type: "photo", photo }, spec, tags));
}

export function photoIsPublished(photo: Photo, tags: Tag[] = []): boolean {
  return photoHasTag(photo, PUBLISH_TAG_ID, tags);
}

export function publishedPhotos(photos: Photo[], tags: Tag[] = []): Photo[] {
  return photos.filter((photo) => photoIsPublished(photo, tags));
}

export function catalogFeed(catalog: Catalog, spec?: SavedFilterSpec | null, order?: string[] | null): FeedItem[] {
  const textsFile = catalog.texts ?? emptyTexts();
  const photos = new Map(catalog.photos.photos.map((photo) => [photo.id, photo]));
  const texts = new Map(textsFile.texts.map((text) => [text.id, text]));
  const items = normalizeItems(catalog.photos.photos, textsFile.texts, textsFile.items);
  const active = spec && !isEmptyFilterSpec(spec) ? spec : null;
  const out: FeedItem[] = [];
  for (const ref of items) {
    if (ref.type === "photo") {
      const photo = photos.get(ref.id);
      if (!photo) continue;
      const item: FeedItem = { type: "photo", photo };
      if (active && !feedItemMatchesSpec(item, active, catalog.tags.tags)) continue;
      out.push(item);
    } else {
      const text = texts.get(ref.id);
      if (!text) continue;
      const item: FeedItem = { type: "text", text };
      if (active && !feedItemMatchesSpec(item, active, catalog.tags.tags)) continue;
      out.push(item);
    }
  }
  return applyFeedOrder(out, order);
}

export function feedItemId(item: FeedItem): string {
  return item.type === "photo" ? item.photo.id : item.text.id;
}

export function applyFeedOrder(items: FeedItem[], order?: string[] | null): FeedItem[] {
  if (!order?.length) return items;
  const byId = new Map(items.map((item) => [feedItemId(item), item]));
  const seen = new Set<string>();
  const out: FeedItem[] = [];
  for (const id of order) {
    const item = byId.get(id);
    if (!item || seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  for (const item of items) {
    const id = feedItemId(item);
    if (seen.has(id)) continue;
    out.push(item);
  }
  return out;
}

export function resolvePageFilterOrder(page: GalleryPage): string[] | undefined {
  return parseFilterOrder(page.filter.order);
}

export function catalogFeedForPage(catalog: Catalog, page: GalleryPage): FeedItem[] {
  return catalogFeed(catalog, resolvePageFilterSpec(page, catalog), resolvePageFilterOrder(page));
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
      protection: {
        ...editorProtection(catalog.site.protection),
        crypto: parseProtectionCrypto(catalog.site.protection?.crypto),
      },
      pages: stripPrivatePages(withInheritedVisibility(catalog.site.pages)),
    },
  };
}

function fileExt(path: string): string {
  const match = path.match(/\.([a-z0-9]+)$/i);
  return match?.[1]?.toLowerCase() ?? "webp";
}

export function publicPhotoFiles(photo: Photo, encrypted = false): PhotoFiles {
  const displayExt = encrypted ? ENCRYPTED_IMAGE_EXT : fileExt(photo.files.display);
  const thumbExt = encrypted ? ENCRYPTED_IMAGE_EXT : fileExt(photo.files.thumb);
  return {
    display: `images/display/${photo.id}.${displayExt}`,
    thumb: `images/thumbs/${photo.id}.${thumbExt}`,
  };
}

export function toPublicPhotos(photos: PhotosFile, encrypted = false): PhotosFile {
  return {
    version: 1,
    photos: photos.photos.map((photo) => ({
      ...photo,
      files: publicPhotoFiles(photo, encrypted),
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

export function firstGalleryPage(page: SitePage): GalleryPage | null {
  if (page.type === "gallery") return page;
  if (page.type === "group") {
    for (const child of page.children) {
      const found = firstGalleryPage(child);
      if (found) return found;
    }
  }
  return null;
}

/** Bilder, aus denen ein Index-Bild gewählt werden kann. */
export function photosForCover(page: GalleryPage | GroupPage, catalog: Catalog): Photo[] {
  const fromFeed = (gallery: GalleryPage) =>
    catalogFeedForPage(catalog, gallery).flatMap((item) => (item.type === "photo" ? [item.photo] : []));
  if (page.type === "gallery") return fromFeed(page);
  const seen = new Set<string>();
  const out: Photo[] = [];
  for (const gallery of flattenGalleryPages([page])) {
    for (const photo of fromFeed(gallery)) {
      if (seen.has(photo.id)) continue;
      seen.add(photo.id);
      out.push(photo);
    }
  }
  return out.length ? out : catalog.photos.photos;
}

export function coverPhoto(page: GalleryPage | GroupPage, catalog: Catalog): Photo | undefined {
  const pool = photosForCover(page, catalog);
  if (page.cover) {
    const chosen =
      catalog.photos.photos.find((photo) => photo.id === page.cover) ?? pool.find((item) => item.id === page.cover);
    if (chosen) return chosen;
  }
  return pool[0];
}

export type WorkIndexTile = {
  page: GalleryPage | GroupPage;
  openId: string;
};

/** Work-Kacheln: Gruppe mit Index-Bild als eine Kachel, sonst Kinder einzeln. */
export function workIndexTiles(pages: SitePage[]): WorkIndexTile[] {
  const out: WorkIndexTile[] = [];
  const walk = (items: SitePage[]) => {
    for (const page of items) {
      if (page.type === "gallery") {
        out.push({ page, openId: page.id });
        continue;
      }
      if (page.type !== "group") continue;
      if (page.cover) {
        const first = firstGalleryPage(page);
        if (first) out.push({ page, openId: first.id });
        continue;
      }
      walk(page.children);
    }
  };
  walk(navPages(pages));
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

export function stripTagFromPages(pages: SitePage[], tagId: string): SitePage[] {
  return pages.map((page) => {
    if (page.type === "gallery") {
      return { ...page, filter: { ...page.filter, ...stripTagFromSpec(galleryFilterSpec(page.filter), tagId) } };
    }
    if (page.type === "group") return { ...page, children: stripTagFromPages(page.children, tagId) };
    return page;
  });
}
