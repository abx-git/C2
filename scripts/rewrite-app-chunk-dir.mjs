import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

/** Firmenproxys antworten auf URLs mit „/app/“ oft mit 403. */
export const SAFE_APP_CHUNK_DIR = "c2";

export function rewriteAppChunkPaths(content) {
  return content.replaceAll("chunks/app/", `chunks/${SAFE_APP_CHUNK_DIR}/`);
}

async function walk(dir, base, out) {
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) await walk(p, base, out);
    else out.push(relative(base, p).replaceAll("\\", "/"));
  }
}

async function copyDir(src, dest) {
  await mkdir(dest, { recursive: true });
  for (const ent of await readdir(src, { withFileTypes: true })) {
    const from = join(src, ent.name);
    const to = join(dest, ent.name);
    if (ent.isDirectory()) await copyDir(from, to);
    else await writeFile(to, await readFile(from));
  }
}

export async function relocateAppChunks(root) {
  const src = join(root, "_next/static/chunks/app");
  const dest = join(root, `_next/static/chunks/${SAFE_APP_CHUNK_DIR}`);
  if (existsSync(src)) {
    await copyDir(src, dest);
    await rm(src, { recursive: true, force: true });
  }
  const files = [];
  await walk(root, root, files);
  for (const path of files) {
    if (!/\.(html|js|css|json|txt)$/.test(path)) continue;
    const full = join(root, path);
    const before = await readFile(full, "utf8");
    const after = rewriteAppChunkPaths(before);
    if (after !== before) await writeFile(full, after);
  }
}
