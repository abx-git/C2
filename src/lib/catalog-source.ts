import {
  emptyCatalog,
  parseCatalog,
  type Catalog,
  type Photo,
} from "./catalog";

export type CatalogSource = {
  loadCatalog: () => Promise<Catalog>;
  imageUrl: (relativePath: string) => string;
  revoke?: (url: string) => void;
};

type EmbeddedCatalog = {
  tags?: unknown;
  photos?: unknown;
  site?: unknown;
  texts?: unknown;
  filters?: unknown;
};

function readEmbeddedCatalog(): Catalog | null {
  const raw = (globalThis as { __C2_CATALOG__?: EmbeddedCatalog }).__C2_CATALOG__;
  if (!raw) return null;
  return parseCatalog(raw.tags ?? {}, raw.photos ?? {}, raw.site ?? {}, raw.texts ?? {}, raw.filters ?? {});
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (res.status === 404) return {};
  if (!res.ok) throw new Error(`${url} (${res.status})`);
  return res.json();
}

async function loadCatalogFromJson(prefix: string): Promise<Catalog> {
  const [tags, photos, site, texts, filters] = await Promise.all([
    fetchJson(`${prefix}/data/tags.json`),
    fetchJson(`${prefix}/data/photos.json`),
    fetchJson(`${prefix}/data/site.json`),
    fetchJson(`${prefix}/data/texts.json`),
    fetchJson(`${prefix}/data/filters.json`),
  ]);
  return parseCatalog(tags, photos, site, texts, filters);
}

export function catalogBootstrapScript(catalog: Pick<Catalog, "tags" | "photos" | "site" | "texts" | "filters">): string {
  const json = JSON.stringify({
    tags: catalog.tags,
    photos: catalog.photos,
    site: catalog.site,
    texts: catalog.texts,
    filters: catalog.filters,
  }).replace(/</g, "\\u003c");
  return `window.__C2_CATALOG__=${json};`;
}

export function injectCatalogIntoHtml(html: string, bootstrap: string): string {
  const tag = `<script id="c2-catalog">${bootstrap}</script>`;
  const stripped = html.replace(/<script id="c2-catalog">[\s\S]*?<\/script>/, "");
  if (stripped.includes("<head>")) return stripped.replace("<head>", `<head>${tag}`);
  if (stripped.includes("<body")) return stripped.replace(/<body([^>]*)>/, `<body$1>${tag}`);
  return `${tag}${stripped}`;
}

export async function loadPublicCatalog(base = "."): Promise<Catalog> {
  const prefix = base.replace(/\/$/, "") || ".";
  const embedded = readEmbeddedCatalog();
  if (embedded) return embedded;

  const fileProtocol = typeof window !== "undefined" && window.location.protocol === "file:";
  if (fileProtocol) {
    throw new Error("Galerie-Daten fehlen in index.html. Bitte den Ordner erneut deployen.");
  }

  return loadCatalogFromJson(prefix);
}

export function createHttpCatalogSource(base = "."): CatalogSource {
  const prefix = base.replace(/\/$/, "") || ".";
  return {
    async loadCatalog() {
      return loadPublicCatalog(prefix);
    },
    imageUrl(relativePath: string) {
      const path = relativePath.replace(/^\.\//, "").replace(/^\/+/, "");
      return `${prefix}/${path}`;
    },
  };
}

export function createMemoryCatalogSource(
  catalog: Catalog,
  resolveUrl: (photo: Photo, kind: "thumb" | "display") => string,
): CatalogSource & { catalog: Catalog } {
  return {
    catalog,
    async loadCatalog() {
      return catalog;
    },
    imageUrl(relativePath: string) {
      const photo = catalog.photos.photos.find(
        (p) => p.files.thumb === relativePath || p.files.display === relativePath,
      );
      if (!photo) return "";
      const kind = photo.files.display === relativePath ? "display" : "thumb";
      return resolveUrl(photo, kind);
    },
  };
}

export { emptyCatalog };
