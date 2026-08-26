/** Editor at `/` during `next dev` and on GitHub Pages. Deploy-Ordner remain the gallery. */
export function editorIsHome(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return Boolean(base && base !== "/");
}
