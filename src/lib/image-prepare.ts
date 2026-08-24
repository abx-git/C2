export const DISPLAY_MAX_EDGE = 2048;
export const THUMB_MAX_EDGE = 400;
export const WEBP_QUALITY = 0.84;

export type PreparedImage = {
  display: Blob;
  thumb: Blob;
  width: number;
  height: number;
  originalExt: string;
};

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif", "tif", "tiff", "bmp", "avif"]);

export function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  const ext = extensionOf(file.name);
  return IMAGE_EXTS.has(ext);
}

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return "jpg";
  return filename.slice(dot + 1).toLowerCase();
}

async function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));
  if (blob) return blob;
  if (mime !== "image/jpeg") {
    const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (jpeg) return jpeg;
  }
  throw new Error("Bild konnte nicht kodiert werden");
}

function fit(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const edge = Math.max(width, height);
  if (edge <= maxEdge) return { width, height };
  const scale = maxEdge / edge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function encodeVariant(bitmap: ImageBitmap, maxEdge: number): Promise<{ blob: Blob; width: number; height: number }> {
  const size = fit(bitmap.width, bitmap.height, maxEdge);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas nicht verfügbar");
  ctx.drawImage(bitmap, 0, 0, size.width, size.height);
  const blob = await canvasToBlob(canvas, "image/webp", WEBP_QUALITY);
  return { blob, width: size.width, height: size.height };
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  try {
    const display = await encodeVariant(bitmap, DISPLAY_MAX_EDGE);
    const thumb = await encodeVariant(bitmap, THUMB_MAX_EDGE);
    return {
      display: display.blob,
      thumb: thumb.blob,
      width: display.width,
      height: display.height,
      originalExt: extensionOf(file.name) || "jpg",
    };
  } finally {
    bitmap.close();
  }
}
