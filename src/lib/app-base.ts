/** Root-relative base of the C2 app (parent of /edit/). */
export function appBase(): string {
  if (typeof window === "undefined") return ".";
  const path = window.location.pathname.replace(/\/+$/, "");
  if (path.endsWith("/edit")) return "..";
  return ".";
}
