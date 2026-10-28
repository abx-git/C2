import { extensionOf, fitMaxEdge, isImageFile, WEBP_QUALITY } from "./image-prepare";

export type PreparedVideo = {
  thumb: Blob;
  width: number;
  height: number;
  originalExt: string;
};

const VIDEO_EXTS = new Set(["mp4"]);

export function isVideoFile(file: File): boolean {
  if (file.type === "video/mp4" || file.type.startsWith("video/")) {
    return extensionOf(file.name) === "mp4" || file.type === "video/mp4";
  }
  return VIDEO_EXTS.has(extensionOf(file.name));
}

export function isMediaFile(file: File): boolean {
  return isImageFile(file) || isVideoFile(file);
}

async function canvasToWebp(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", WEBP_QUALITY));
  if (blob) return blob;
  const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", WEBP_QUALITY));
  if (jpeg) return jpeg;
  throw new Error("Vorschaubild konnte nicht erstellt werden");
}

function loadVideoMetadata(file: File): Promise<{ video: HTMLVideoElement; url: string }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  return new Promise((resolve, reject) => {
    const fail = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Video konnte nicht gelesen werden"));
    };
    video.onloadedmetadata = () => resolve({ video, url });
    video.onerror = fail;
  });
}

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      resolve();
    };
    const onError = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      reject(new Error("Vorschaubild fehlgeschlagen"));
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.currentTime = time;
  });
}

export async function prepareVideo(file: File): Promise<PreparedVideo> {
  if (!isVideoFile(file)) throw new Error("Kein MP4-Video");
  const { video, url } = await loadVideoMetadata(file);
  try {
    const width = video.videoWidth || 1920;
    const height = video.videoHeight || 1080;
    const seekAt = Number.isFinite(video.duration) && video.duration > 0 ? Math.min(1, video.duration * 0.1) : 0;
    await seekVideo(video, seekAt);
    const size = fitMaxEdge(width, height, 400);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas nicht verfügbar");
    ctx.drawImage(video, 0, 0, size.width, size.height);
    const thumb = await canvasToWebp(canvas);
    return {
      thumb,
      width,
      height,
      originalExt: extensionOf(file.name) || "mp4",
    };
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
    video.load();
  }
}
