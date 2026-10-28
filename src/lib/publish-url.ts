import { normalizePublishPath, type SiteFile } from "@/lib/catalog";

/** Öffentliche Adresse nach dem Upload (optional in Struktur hinterlegt). */
export function publicSiteLink(
  site: Pick<SiteFile, "publishPath" | "publicUrl">,
  remoteBase = "likibox",
): { href: string | null; pathLabel: string; hint: string } {
  const slug = normalizePublishPath(site.publishPath);
  const remote = (remoteBase || "likibox").replace(/^\/+|\/+$/g, "") || "likibox";
  const pathLabel = slug ? `/${remote}/${slug}/` : `/${remote}/`;
  const base = (site.publicUrl ?? "").trim().replace(/\/+$/, "");
  if (base) {
    const href = slug ? `${base}/${slug}/` : `${base}/`;
    return {
      href,
      pathLabel,
      hint: `Die Galerie liegt unter ${href}`,
    };
  }
  return {
    href: null,
    pathLabel,
    hint: `Auf dem Server: ${pathLabel} — unter Struktur „Adresse der Website“ können Sie einen klickbaren Link hinterlegen.`,
  };
}
