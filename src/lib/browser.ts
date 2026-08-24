export async function isBrave(): Promise<boolean> {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { brave?: { isBrave?: () => Promise<boolean> } };
  try {
    if (nav.brave?.isBrave) return await nav.brave.isBrave();
  } catch {
    return false;
  }
  return false;
}

export const BRAVE_FS_HELP = [
  "Brave blockiert den Ordnerzugriff standardmäßig. So schalten Sie ihn ein:",
  "1. Neuen Tab öffnen: brave://flags/#file-system-access-api",
  "2. „File System Access API“ auf Enabled setzen",
  "3. Relaunch, danach diese Seite neu laden",
  "4. Falls der Dialog weiter fehlt: Shields für localhost auf Aus",
].join("\n");
