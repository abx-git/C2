import type { NextConfig } from "next";

/** GitHub Project Pages: https://<user>.github.io/<repo>/ — leer lassen für lokale/Finder-Builds. */
const rawBase = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const basePath = rawBase === "/" ? "" : rawBase.replace(/\/$/, "");
const pagesBuild = Boolean(basePath);

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  ...(pagesBuild
    ? { basePath, assetPrefix: basePath }
    : process.env.NODE_ENV === "production"
      ? { assetPrefix: "." }
      : {}),
};

export default nextConfig;
