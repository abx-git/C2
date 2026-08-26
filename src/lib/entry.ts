/**
 * Editor at `/` in `next dev` and on GitHub Pages.
 * Deploy folders (HAC `/pictures`, file://, custom hosts) always show the gallery —
 * even when the JS was copied from a Pages build where BASE_PATH was set at compile time.
 */
export function editorIsHome(location?: Pick<Location, "hostname"> | null): boolean {
  if (process.env.NODE_ENV === "development") return true;
  const loc = location ?? (typeof window === "undefined" ? null : window.location);
  if (!loc) {
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    return Boolean(base && base !== "/");
  }
  return loc.hostname.endsWith(".github.io");
}
