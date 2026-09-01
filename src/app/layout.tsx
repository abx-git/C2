import type { Metadata, Viewport } from "next";
import { ClearStaleWorkers } from "@/components/clear-stale-workers";
import "./globals.css";
import "../themes/gallery-v1.css";
import "../themes/roadtrip.css";

export const metadata: Metadata = {
  title: "Andreas Bergmann Pictures",
  description: "my views",
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }] },
};

export const viewport: Viewport = {
  themeColor: "#f4f1ec",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body className="h-full">
        <ClearStaleWorkers />
        {children}
      </body>
    </html>
  );
}
