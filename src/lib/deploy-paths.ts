/** Firmenproxys antworten auf URLs mit „/app/“ oft mit 403. */
export const SAFE_APP_CHUNK_DIR = "c2";

export function rewriteAppChunkPaths(content: string): string {
  return content
    .replaceAll("chunks/app/", `chunks/${SAFE_APP_CHUNK_DIR}/`)
    .replace(/chunks\/(?!c2-)([0-9a-f]+-[0-9a-f]+\.js)/gi, "chunks/c2-$1");
}

function assetPrefixFor(relPath: string): string {
  const slash = relPath.lastIndexOf("/");
  if (slash < 0) return "./";
  return "../".repeat(relPath.slice(0, slash).split("/").filter(Boolean).length);
}

/** `/C2/edit` → `/C2`; editor at `/C2` → `/C2`; localhost `/` → "". */
export function editorSiteBasePath(pathname = typeof window === "undefined" ? "" : window.location.pathname): string {
  const path = pathname.replace(/\/+$/, "");
  if (path.endsWith("/edit")) {
    const parent = path.slice(0, -"/edit".length);
    return parent === "/" ? "" : parent;
  }
  if (path && path !== "/") return path;
  return "";
}

function collectAssetBases(content: string, extraBase = ""): string[] {
  const bases = new Set<string>();
  if (extraBase) bases.add(extraBase);
  for (const match of content.matchAll(/r\.p="(\/[^"]*)\/_next\/"/g)) {
    if (match[1]) bases.add(match[1]);
  }
  for (const match of content.matchAll(/(?:src|href|path)[:=]"((?:\/[^"]*?)?)\/_next\//g)) {
    if (match[1]) bases.add(match[1]);
  }
  return [...bases];
}

/** GitHub-Pages-Builds nutzen /C2/_next/ — unter file:// muss das relativ sein. */
export function rewriteAssetPaths(relPath: string, content: string, extraBase = editorSiteBasePath()): string {
  const prefix = relPath.endsWith(".html") ? assetPrefixFor(relPath) : "./";
  let next = content;
  for (const base of collectAssetBases(content, extraBase)) {
    next = next.replaceAll(`${base}/_next/`, `${prefix}_next/`);
    next = next.replaceAll(`${base}/icon.svg`, `${prefix}icon.svg`);
  }
  next = next.replace(/(?<!\.)\/_next\//g, `${prefix}_next/`);
  next = next.replace(/(?<!\.)\/icon\.svg/g, `${prefix}icon.svg`);
  if (relPath.endsWith(".js")) {
    next = next.replace(/r\.p="[^"]*\/_next\/"/g, 'r.p="./_next/"');
  }
  return rewriteAppChunkPaths(next);
}
