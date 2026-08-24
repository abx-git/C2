import { create } from "zustand";
import { BRAVE_FS_HELP, isBrave } from "@/lib/browser";
import {
  createTag,
  emptyCatalog,
  emptyTexts,
  ensurePublishTag,
  isPublishTag,
  parseCatalog,
  tagInUse,
  normalizeItems,
  type Catalog,
  type FeedRef,
  type Photo,
  type SiteFile,
  type SitePage,
  type Tag,
  type TextTile,
} from "@/lib/catalog";
import { newId } from "@/lib/id";
import { readFileExif } from "@/lib/exif";
import { isImageFile, prepareImage } from "@/lib/image-prepare";
import {
  WORKSPACE_DIRS,
  clearDirectoryHandle,
  ensureDirPath,
  getDirectoryAtPath,
  loadDirectoryHandle,
  pickDirectory,
  queryWriteAccess,
  readBinaryFile,
  readJsonFile,
  removeFile,
  saveDirectoryHandle,
  supportsDirectoryPicker,
  writeBinaryFile,
  writeJsonFile,
} from "@/lib/workspace";

export type EditorTab = "photos" | "tags" | "site" | "preview";

export type ImportProgress = {
  current: number;
  total: number;
  name: string;
};

export type EditorStatus = "disconnected" | "ready" | "error";

type EditorState = {
  status: EditorStatus;
  workspaceLabel: string | null;
  canWrite: boolean;
  catalog: Catalog;
  selectedPhotoId: string | null;
  selectedPhotoIds: string[];
  previewPhotoId: string | null;
  tab: EditorTab;
  importProgress: ImportProgress | null;
  message: string | null;
  error: string | null;
  dirty: boolean;
  thumbUrls: Record<string, string>;
  displayUrls: Record<string, string>;
  restoring: boolean;
  needsGesture: boolean;

  restoreWorkspace: () => Promise<void>;
  connectWorkspace: () => Promise<void>;
  reauthorizeWorkspace: () => Promise<void>;
  disconnect: () => void;
  importFiles: (files: File[]) => Promise<void>;
  selectPhoto: (id: string | null) => void;
  togglePhotoSelected: (id: string) => void;
  selectPhotos: (ids: string[], focusId?: string) => void;
  openPreview: (id: string) => void;
  closePreview: () => void;
  ensureDisplayUrl: (id: string) => Promise<string | null>;
  ensureDisplayUrls: (ids: string[]) => Promise<void>;
  setTab: (tab: EditorTab) => void;
  updatePhoto: (id: string, patch: Partial<Pick<Photo, "title" | "caption" | "takenAt" | "tags">>) => void;
  updateText: (id: string, patch: Partial<Pick<TextTile, "title" | "body" | "tags">>) => void;
  addTextTile: () => string | null;
  setPhotosTag: (ids: string[], tagId: string, on: boolean) => void;
  reorderPhotos: (fromId: string, toId: string, visibleIds: string[]) => void;
  deletePhoto: (id: string) => Promise<void>;
  deleteText: (id: string) => void;
  addTag: (name: string) => Tag | null;
  renameTag: (id: string, name: string) => void;
  deleteTag: (id: string, force?: boolean) => boolean;
  updateSite: (site: SiteFile) => void;
  saveCatalog: () => Promise<void>;
  pickDeployFolder: () => Promise<FileSystemDirectoryHandle | null>;
  getWorkspaceHandle: () => FileSystemDirectoryHandle | null;
};

let workspaceHandle: FileSystemDirectoryHandle | null = null;
let workspaceLoadId = 0;
const blobUrls = new Set<string>();
const displayLoads = new Map<string, Promise<string | null>>();

type EditorSet = (
  partial: Partial<EditorState> | ((state: EditorState) => Partial<EditorState>),
) => void;
type EditorGet = () => EditorState;

function revokeAllUrls() {
  for (const url of blobUrls) URL.revokeObjectURL(url);
  blobUrls.clear();
}

function rememberUrl(url: string): string {
  blobUrls.add(url);
  return url;
}

function moveVisibleIds(visibleIds: string[], movingIds: string[], toId: string): string[] | null {
  const movingSet = new Set(movingIds);
  const moving = visibleIds.filter((id) => movingSet.has(id));
  if (!moving.length || movingSet.has(toId)) return null;
  const rest = visibleIds.filter((id) => !movingSet.has(id));
  const insertAt = rest.indexOf(toId);
  if (insertAt < 0) return null;
  rest.splice(insertAt, 0, ...moving);
  return rest;
}

function applyVisibleOrder<T extends { id: string }>(list: T[], visibleIds: string[], nextVisibleIds: string[]): T[] {
  const queue = [...nextVisibleIds];
  const visibleSet = new Set(visibleIds);
  const byId = new Map(list.map((item) => [item.id, item]));
  return list.map((item) => {
    if (!visibleSet.has(item.id)) return item;
    const id = queue.shift();
    return (id && byId.get(id)) || item;
  });
}

async function loadCatalogFromHandle(handle: FileSystemDirectoryHandle): Promise<Catalog> {
  const [tags, photos, site, texts] = await Promise.all([
    readJsonFile(handle, "data/tags.json"),
    readJsonFile(handle, "data/photos.json"),
    readJsonFile(handle, "data/site.json"),
    readJsonFile(handle, "data/texts.json"),
  ]);
  const catalog = parseCatalog(tags ?? {}, photos ?? {}, site ?? {}, texts ?? {});
  return {
    ...catalog,
    tags: { version: 1, tags: ensurePublishTag(catalog.tags.tags) },
  };
}

async function ensureWorkspaceLayout(handle: FileSystemDirectoryHandle): Promise<void> {
  for (const dir of WORKSPACE_DIRS) {
    await ensureDirPath(handle, dir);
  }
  const [tags, photos, site, texts] = await Promise.all([
    readJsonFile(handle, "data/tags.json"),
    readJsonFile(handle, "data/photos.json"),
    readJsonFile(handle, "data/site.json"),
    readJsonFile(handle, "data/texts.json"),
  ]);
  const catalog = parseCatalog(tags ?? {}, photos ?? {}, site ?? {}, texts ?? {});
  const nextTags = ensurePublishTag(catalog.tags.tags);
  if (!tags || nextTags.length !== catalog.tags.tags.length) {
    await writeJsonFile(handle, "data/tags.json", { version: 1, tags: nextTags });
  }
  if (!photos) await writeJsonFile(handle, "data/photos.json", catalog.photos);
  if (!site) await writeJsonFile(handle, "data/site.json", catalog.site);
  if (!texts) await writeJsonFile(handle, "data/texts.json", catalog.texts);
}

function fileName(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() || path;
}

async function readNamedFile(
  dir: FileSystemDirectoryHandle | null,
  relativePath: string,
  root: FileSystemDirectoryHandle,
): Promise<File | null> {
  if (dir) {
    try {
      const handle = await dir.getFileHandle(fileName(relativePath));
      return await handle.getFile();
    } catch {
      return null;
    }
  }
  return readBinaryFile(root, relativePath);
}

async function fillThumbUrls(
  handle: FileSystemDirectoryHandle,
  photos: Photo[],
  loadId: number,
  set: EditorSet,
  get: EditorGet,
): Promise<void> {
  if (!photos.length) return;
  let thumbDir: FileSystemDirectoryHandle | null = null;
  try {
    thumbDir = await getDirectoryAtPath(handle, "derived/thumbs");
  } catch {
    thumbDir = null;
  }
  const batchSize = 16;
  for (let i = 0; i < photos.length; i += batchSize) {
    if (loadId !== workspaceLoadId || workspaceHandle !== handle) return;
    const slice = photos.slice(i, i + batchSize);
    const found = await Promise.all(
      slice.map(async (photo) => {
        const file = await readNamedFile(thumbDir, photo.files.thumb, handle);
        if (!file) return null;
        return [photo.id, rememberUrl(URL.createObjectURL(file))] as const;
      }),
    );
    if (loadId !== workspaceLoadId || workspaceHandle !== handle) {
      for (const item of found) {
        if (!item) continue;
        URL.revokeObjectURL(item[1]);
        blobUrls.delete(item[1]);
      }
      return;
    }
    const next: Record<string, string> = {};
    for (const item of found) if (item) next[item[0]] = item[1];
    const loaded = Math.min(i + batchSize, photos.length);
    set({
      thumbUrls: { ...get().thumbUrls, ...next },
      message: loaded < photos.length ? `Vorschaubilder ${loaded}/${photos.length}` : null,
    });
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }
}

async function presentWorkspace(
  handle: FileSystemDirectoryHandle,
  set: EditorSet,
  get: EditorGet,
  extra: { message?: string | null } = {},
): Promise<void> {
  const loadId = ++workspaceLoadId;
  set({
    restoring: true,
    workspaceLabel: handle.name,
    message: extra.message ?? "Katalog wird gelesen…",
    error: null,
  });
  await ensureWorkspaceLayout(handle);
  const catalog = await loadCatalogFromHandle(handle);
  if (loadId !== workspaceLoadId) return;
  workspaceHandle = handle;
  await saveDirectoryHandle(handle);
  revokeAllUrls();
  displayLoads.clear();
  const count = catalog.photos.photos.length;
  set({
    status: "ready",
    workspaceLabel: handle.name,
    canWrite: true,
    catalog,
    restoring: false,
    needsGesture: false,
    dirty: false,
    error: null,
    message: extra.message ?? (count ? `Vorschaubilder 0/${count}` : `Workspace „${handle.name}“ verbunden.`),
    thumbUrls: {},
    displayUrls: {},
  });
  void fillThumbUrls(handle, catalog.photos.photos, loadId, set, get);
}

async function addPreviewUrl(
  handle: FileSystemDirectoryHandle,
  photo: Photo,
): Promise<{ thumb?: string; display?: string }> {
  const out: { thumb?: string; display?: string } = {};
  const thumb = await readBinaryFile(handle, photo.files.thumb);
  const display = await readBinaryFile(handle, photo.files.display);
  if (thumb) out.thumb = rememberUrl(URL.createObjectURL(thumb));
  if (display) out.display = rememberUrl(URL.createObjectURL(display));
  return out;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  status: "disconnected",
  workspaceLabel: null,
  canWrite: false,
  catalog: emptyCatalog(),
  selectedPhotoId: null,
  selectedPhotoIds: [],
  previewPhotoId: null,
  tab: "photos",
  importProgress: null,
  message: null,
  error: null,
  dirty: false,
  thumbUrls: {},
  displayUrls: {},
  restoring: true,
  needsGesture: false,

  getWorkspaceHandle: () => workspaceHandle,

  restoreWorkspace: async () => {
    try {
      const handle = await loadDirectoryHandle();
      if (!handle) {
        set({ restoring: false, needsGesture: false });
        return;
      }
      workspaceHandle = handle;
      let granted = false;
      try {
        granted = handle.queryPermission
          ? (await handle.queryPermission({ mode: "readwrite" })) === "granted"
          : false;
      } catch {
        granted = false;
      }
      if (!granted) {
        set({ restoring: false, needsGesture: true, workspaceLabel: handle.name });
        return;
      }
      await presentWorkspace(handle, set, get);
    } catch (err) {
      set({
        restoring: false,
        needsGesture: false,
        status: "disconnected",
        error: err instanceof Error ? err.message : "Workspace konnte nicht gelesen werden",
      });
    }
  },

  reauthorizeWorkspace: async () => {
    const handle = workspaceHandle ?? (await loadDirectoryHandle());
    if (!handle) {
      await get().connectWorkspace();
      return;
    }
    workspaceHandle = handle;
    let permitted: PermissionState | "unknown" = "unknown";
    try {
      if (handle.requestPermission) {
        permitted = await handle.requestPermission({ mode: "readwrite" });
      } else {
        permitted = (await queryWriteAccess(handle)) ? "granted" : "denied";
      }
    } catch {
      permitted = "denied";
    }
    if (permitted !== "granted") {
      set({ error: "Schreibzugriff auf den Ordner wurde nicht erteilt.", needsGesture: true });
      return;
    }
    try {
      await presentWorkspace(handle, set, get);
    } catch (err) {
      set({
        status: "error",
        error: err instanceof Error ? err.message : "Workspace konnte nicht gelesen werden",
      });
    }
  },

  connectWorkspace: async () => {
    if (!supportsDirectoryPicker()) {
      const brave = await isBrave();
      set({
        error: brave
          ? BRAVE_FS_HELP
          : "Dieser Browser erlaubt keinen Ordnerzugriff. Bitte Brave (mit File System Access API), Chrome oder Edge verwenden — nicht in einer eingebetteten Vorschau.",
      });
      return;
    }
    set({ message: "Ordner-Dialog sollte im Vordergrund liegen …", error: null });
    let handle: FileSystemDirectoryHandle | null;
    try {
      handle = await pickDirectory("readwrite");
    } catch (err) {
      set({
        message: null,
        error: err instanceof Error ? err.message : "Ordner konnte nicht geöffnet werden.",
      });
      return;
    }
    if (!handle) {
      set({ message: null });
      return;
    }
    const canWrite = await queryWriteAccess(handle);
    if (!canWrite) {
      set({
        message: null,
        error: "Schreibzugriff auf den Ordner wurde nicht erteilt.",
        status: "error",
      });
      return;
    }
    try {
      await presentWorkspace(handle, set, get, { message: `Workspace „${handle.name}“ verbunden.` });
    } catch (err) {
      set({
        message: null,
        restoring: false,
        status: "error",
        error: err instanceof Error ? err.message : "Workspace konnte nicht gelesen werden",
      });
    }
  },

  disconnect: () => {
    workspaceLoadId += 1;
    workspaceHandle = null;
    displayLoads.clear();
    revokeAllUrls();
    void clearDirectoryHandle();
    set({
      status: "disconnected",
      workspaceLabel: null,
      canWrite: false,
      catalog: emptyCatalog(),
      selectedPhotoId: null,
      selectedPhotoIds: [],
      previewPhotoId: null,
      dirty: false,
      thumbUrls: {},
      displayUrls: {},
      restoring: false,
      needsGesture: false,
      message: null,
      error: null,
    });
  },

  importFiles: async (files) => {
    const handle = workspaceHandle;
    const state = get();
    if (!handle || !state.canWrite) {
      set({ error: "Bitte zuerst einen Workspace-Ordner mit Schreibzugriff öffnen." });
      return;
    }
    const images = files.filter(isImageFile);
    if (!images.length) {
      set({ error: "Keine Bilddateien gefunden." });
      return;
    }

    const photos = [...state.catalog.photos.photos];
    const newRefs: FeedRef[] = [];
    const errors: string[] = [];
    let lastId: string | null = state.selectedPhotoId;
    const thumbUrls = { ...state.thumbUrls };
    const displayUrls = { ...state.displayUrls };

    for (let i = 0; i < images.length; i += 1) {
      const file = images[i]!;
      set({ importProgress: { current: i + 1, total: images.length, name: file.name }, error: null });
      try {
        const prepared = await prepareImage(file);
        const id = newId();
        const ext = prepared.originalExt.replace(/[^a-z0-9]/g, "") || "jpg";
        const originalPath = `originals/${id}.${ext}`;
        const displayPath = `derived/display/${id}.webp`;
        const thumbPath = `derived/thumbs/${id}.webp`;
        await writeBinaryFile(handle, originalPath, file);
        await writeBinaryFile(handle, displayPath, prepared.display);
        await writeBinaryFile(handle, thumbPath, prepared.thumb);
        const exif = await readFileExif(file);
        const photo: Photo = {
          id,
          originalName: file.name,
          title: "",
          caption: "",
          takenAt: exif?.takenAt ?? new Date(file.lastModified).toISOString(),
          tags: [],
          files: { original: originalPath, display: displayPath, thumb: thumbPath },
          width: prepared.width,
          height: prepared.height,
          exif: exif?.camera || exif?.focalLength ? { camera: exif.camera, focalLength: exif.focalLength } : undefined,
        };
        photos.push(photo);
        newRefs.push({ type: "photo", id });
        lastId = id;
        const urls = await addPreviewUrl(handle, photo);
        if (urls.thumb) thumbUrls[id] = urls.thumb;
        if (urls.display) displayUrls[id] = urls.display;
      } catch (err) {
        errors.push(`${file.name}: ${err instanceof Error ? err.message : "Import fehlgeschlagen"}`);
      }
    }

    const current = get().catalog;
    const textsFile = current.texts ?? emptyTexts();
    const catalog: Catalog = {
      ...current,
      photos: { version: 1, photos },
      texts: {
        version: 1,
        texts: textsFile.texts,
        items: normalizeItems(photos, textsFile.texts, [...textsFile.items, ...newRefs]),
      },
    };
    try {
      await writeJsonFile(handle, "data/photos.json", catalog.photos);
      await writeJsonFile(handle, "data/texts.json", catalog.texts);
      set({
        catalog,
        selectedPhotoId: lastId,
        selectedPhotoIds: lastId ? [lastId] : [],
        importProgress: null,
        dirty: false,
        thumbUrls,
        displayUrls,
        tab: "photos",
        message: errors.length
          ? `${images.length - errors.length} importiert, ${errors.length} fehlgeschlagen.`
          : `${images.length} Bild${images.length === 1 ? "" : "er"} importiert.`,
        error: errors.length ? errors.slice(0, 4).join("\n") : null,
      });
    } catch (err) {
      set({
        importProgress: null,
        error: err instanceof Error ? err.message : "Import konnte nicht gespeichert werden.",
      });
    }
  },

  selectPhoto: (id) => set({ selectedPhotoId: id, selectedPhotoIds: id ? [id] : [] }),
  togglePhotoSelected: (id) => {
    const selected = new Set(get().selectedPhotoIds);
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    const ids = [...selected];
    set({ selectedPhotoId: ids.at(-1) ?? null, selectedPhotoIds: ids });
  },
  selectPhotos: (ids, focusId) =>
    set({
      selectedPhotoIds: ids,
      selectedPhotoId: focusId ?? ids.at(-1) ?? null,
    }),
  openPreview: (id) => {
    set({ selectedPhotoId: id, selectedPhotoIds: [id], previewPhotoId: id });
    void get().ensureDisplayUrl(id);
  },
  closePreview: () => set({ previewPhotoId: null }),
  ensureDisplayUrl: async (id) => {
    const existing = get().displayUrls[id];
    if (existing) return existing;
    const pending = displayLoads.get(id);
    if (pending) return pending;
    const handle = workspaceHandle;
    const photo = get().catalog.photos.photos.find((item) => item.id === id);
    if (!handle || !photo) return null;
    const work = (async () => {
      const file = await readBinaryFile(handle, photo.files.display);
      if (!file || workspaceHandle !== handle) return null;
      const url = rememberUrl(URL.createObjectURL(file));
      set({ displayUrls: { ...get().displayUrls, [id]: url } });
      return url;
    })();
    displayLoads.set(id, work);
    try {
      return await work;
    } finally {
      displayLoads.delete(id);
    }
  },
  ensureDisplayUrls: async (ids) => {
    const missing = ids.filter((id) => !get().displayUrls[id]);
    const concurrency = 4;
    for (let i = 0; i < missing.length; i += concurrency) {
      await Promise.all(missing.slice(i, i + concurrency).map((id) => get().ensureDisplayUrl(id)));
    }
  },
  setTab: (tab) => set({ tab }),

  updatePhoto: (id, patch) => {
    const catalog = get().catalog;
    const photos = catalog.photos.photos.map((photo) => (photo.id === id ? { ...photo, ...patch } : photo));
    set({ catalog: { ...catalog, photos: { version: 1, photos } }, dirty: true });
  },

  updateText: (id, patch) => {
    const catalog = get().catalog;
    const texts = catalog.texts.texts.map((text) => (text.id === id ? { ...text, ...patch } : text));
    set({ catalog: { ...catalog, texts: { ...catalog.texts, texts } }, dirty: true });
  },

  addTextTile: () => {
    const catalog = get().catalog;
    const id = newId();
    const after = get().selectedPhotoId;
    const source =
      catalog.photos.photos.find((photo) => photo.id === after) ??
      catalog.texts.texts.find((item) => item.id === after);
    const text: TextTile = { id, title: "", body: "", tags: source?.tags.slice() ?? [] };
    const texts = [...catalog.texts.texts, text];
    let items = normalizeItems(catalog.photos.photos, texts, catalog.texts.items).filter(
      (ref) => !(ref.type === "text" && ref.id === id),
    );
    const at = after ? items.findIndex((ref) => ref.id === after) : -1;
    if (at >= 0) items.splice(at + 1, 0, { type: "text", id });
    else items.push({ type: "text", id });
    set({
      catalog: { ...catalog, texts: { version: 1, texts, items } },
      selectedPhotoId: id,
      selectedPhotoIds: [id],
      dirty: true,
      tab: "photos",
    });
    return id;
  },

  setPhotosTag: (ids, tagId, on) => {
    if (!ids.length) return;
    const wanted = new Set(ids);
    const catalog = get().catalog;
    const photos = catalog.photos.photos.map((photo) => {
      if (!wanted.has(photo.id)) return photo;
      const has = photo.tags.includes(tagId);
      if (on && !has) return { ...photo, tags: [...photo.tags, tagId] };
      if (!on && has) return { ...photo, tags: photo.tags.filter((id) => id !== tagId) };
      return photo;
    });
    const texts = catalog.texts.texts.map((text) => {
      if (!wanted.has(text.id)) return text;
      const has = text.tags.includes(tagId);
      if (on && !has) return { ...text, tags: [...text.tags, tagId] };
      if (!on && has) return { ...text, tags: text.tags.filter((id) => id !== tagId) };
      return text;
    });
    set({
      catalog: {
        ...catalog,
        photos: { version: 1, photos },
        texts: { ...catalog.texts, texts },
      },
      dirty: true,
    });
  },

  reorderPhotos: (fromId, toId, visibleIds) => {
    if (fromId === toId) return;
    const catalog = get().catalog;
    const items = normalizeItems(catalog.photos.photos, catalog.texts.texts, catalog.texts.items);
    const selected = get().selectedPhotoIds;
    const moving = selected.includes(fromId) && selected.length > 1 ? visibleIds.filter((id) => selected.includes(id)) : [fromId];
    const nextVisible = moveVisibleIds(visibleIds, moving, toId);
    if (!nextVisible) return;
    const nextItems = applyVisibleOrder(items, visibleIds, nextVisible);
    set({
      catalog: { ...catalog, texts: { ...catalog.texts, items: nextItems } },
      dirty: true,
    });
  },

  deletePhoto: async (id) => {
    const handle = workspaceHandle;
    const catalog = get().catalog;
    const photo = catalog.photos.photos.find((p) => p.id === id);
    if (!photo) return;
    if (handle) {
      for (const path of [photo.files.original, photo.files.display, photo.files.thumb]) {
        if (!path) continue;
        try {
          await removeFile(handle, path);
        } catch {
          /* file may already be gone */
        }
      }
    }
    const thumbUrls = { ...get().thumbUrls };
    const displayUrls = { ...get().displayUrls };
    if (thumbUrls[id]) {
      URL.revokeObjectURL(thumbUrls[id]);
      blobUrls.delete(thumbUrls[id]);
      delete thumbUrls[id];
    }
    if (displayUrls[id]) {
      URL.revokeObjectURL(displayUrls[id]);
      blobUrls.delete(displayUrls[id]);
      delete displayUrls[id];
    }
    const photos = catalog.photos.photos.filter((p) => p.id !== id);
    const items = catalog.texts.items.filter((ref) => !(ref.type === "photo" && ref.id === id));
    set({
      catalog: {
        ...catalog,
        photos: { version: 1, photos },
        texts: { ...catalog.texts, items: normalizeItems(photos, catalog.texts.texts, items) },
      },
      selectedPhotoId: get().selectedPhotoId === id ? null : get().selectedPhotoId,
      selectedPhotoIds: get().selectedPhotoIds.filter((photoId) => photoId !== id),
      dirty: true,
      thumbUrls,
      displayUrls,
    });
  },

  deleteText: (id) => {
    const catalog = get().catalog;
    const texts = catalog.texts.texts.filter((text) => text.id !== id);
    const items = catalog.texts.items.filter((ref) => !(ref.type === "text" && ref.id === id));
    set({
      catalog: {
        ...catalog,
        texts: { version: 1, texts, items: normalizeItems(catalog.photos.photos, texts, items) },
      },
      selectedPhotoId: get().selectedPhotoId === id ? null : get().selectedPhotoId,
      selectedPhotoIds: get().selectedPhotoIds.filter((itemId) => itemId !== id),
      dirty: true,
    });
  },

  addTag: (name) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const catalog = get().catalog;
    const tag = createTag(trimmed, catalog.tags.tags);
    set({
      catalog: { ...catalog, tags: { version: 1, tags: [...catalog.tags.tags, tag] } },
      dirty: true,
    });
    return tag;
  },

  renameTag: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const catalog = get().catalog;
    const tags = catalog.tags.tags.map((tag) => (tag.id === id ? { ...tag, name: trimmed } : tag));
    set({ catalog: { ...catalog, tags: { version: 1, tags } }, dirty: true });
  },

  deleteTag: (id, force = false) => {
    if (isPublishTag(id)) return false;
    const catalog = get().catalog;
    if (!force && tagInUse(id, catalog.photos.photos, catalog.texts.texts)) return false;
    const tags = catalog.tags.tags.filter((tag) => tag.id !== id);
    const photos = catalog.photos.photos.map((photo) => ({
      ...photo,
      tags: photo.tags.filter((tagId) => tagId !== id),
    }));
    const texts = catalog.texts.texts.map((text) => ({
      ...text,
      tags: text.tags.filter((tagId) => tagId !== id),
    }));
    const stripFilter = (pages: SitePage[]): SitePage[] =>
      pages.map((page) => {
        if (page.type === "gallery") {
          return { ...page, filter: { tags: page.filter.tags.filter((tagId) => tagId !== id) } };
        }
        if (page.type === "group") {
          return { ...page, children: stripFilter(page.children) };
        }
        return page;
      });
    set({
      catalog: {
        photos: { version: 1, photos },
        texts: { ...catalog.texts, texts },
        tags: { version: 1, tags },
        site: { ...catalog.site, pages: stripFilter(catalog.site.pages) },
      },
      dirty: true,
    });
    return true;
  },

  updateSite: (site) => {
    set({ catalog: { ...get().catalog, site }, dirty: true });
  },

  saveCatalog: async () => {
    const handle = workspaceHandle;
    const { catalog, canWrite, dirty } = get();
    if (!handle || !canWrite || !dirty) return;
    await writeJsonFile(handle, "data/photos.json", catalog.photos);
    await writeJsonFile(handle, "data/tags.json", catalog.tags);
    await writeJsonFile(handle, "data/site.json", catalog.site);
    await writeJsonFile(handle, "data/texts.json", catalog.texts);
    set({ dirty: false });
  },

  pickDeployFolder: async () => pickDirectory("readwrite"),
}));
