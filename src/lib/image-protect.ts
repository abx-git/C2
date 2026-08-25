import { WEBP_QUALITY } from "./image-prepare";
import type { ProtectionCrypto } from "./catalog";

export const ENCRYPTED_MAGIC = new Uint8Array([0x43, 0x32, 0x45, 0x31]); // C2E1
export const PBKDF2_ITERATIONS = 120_000;
const VERIFIER_PLAINTEXT = "c2-gallery-ok";
const IV_LENGTH = 12;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toArrayBuffer(data: BufferSource | Uint8Array): ArrayBuffer {
  const bytes = Uint8Array.from(data instanceof ArrayBuffer ? new Uint8Array(data) : (data as unknown as ArrayLike<number>));
  return bytes.buffer;
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

export async function stampWatermark(source: Blob, text: string): Promise<Blob> {
  const label = text.trim();
  if (!label) return source;
  const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" } as ImageBitmapOptions);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas nicht verfügbar");
    ctx.drawImage(bitmap, 0, 0);
    const size = Math.max(13, Math.round(Math.min(bitmap.width, bitmap.height) * 0.028));
    ctx.font = `500 ${size}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    const pad = Math.max(10, Math.round(size * 0.7));
    ctx.lineWidth = Math.max(2, Math.round(size * 0.12));
    ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
    ctx.strokeText(label, canvas.width - pad, canvas.height - pad);
    ctx.fillText(label, canvas.width - pad, canvas.height - pad);
    return await canvasToBlob(canvas, "image/webp", WEBP_QUALITY);
  } finally {
    bitmap.close();
  }
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: toArrayBuffer(salt), iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptBytes(key: CryptoKey, data: BufferSource | Uint8Array): Promise<ArrayBuffer> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: toArrayBuffer(iv) }, key, toArrayBuffer(data)),
  );
  const out = new Uint8Array(ENCRYPTED_MAGIC.length + iv.length + cipher.length);
  out.set(ENCRYPTED_MAGIC, 0);
  out.set(iv, ENCRYPTED_MAGIC.length);
  out.set(cipher, ENCRYPTED_MAGIC.length + iv.length);
  return toArrayBuffer(out);
}

export async function decryptBytes(key: CryptoKey, data: BufferSource | Uint8Array): Promise<ArrayBuffer> {
  const bytes = new Uint8Array(toArrayBuffer(data));
  const header = ENCRYPTED_MAGIC.length + IV_LENGTH;
  if (bytes.length < header + 16) throw new Error("Datei ist beschädigt.");
  for (let i = 0; i < ENCRYPTED_MAGIC.length; i += 1) {
    if (bytes[i] !== ENCRYPTED_MAGIC[i]) throw new Error("Datei ist nicht verschlüsselt.");
  }
  const iv = toArrayBuffer(bytes.slice(ENCRYPTED_MAGIC.length, header));
  const cipher = toArrayBuffer(bytes.slice(header));
  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
}

async function encryptVerifier(key: CryptoKey): Promise<string> {
  const bytes = new Uint8Array(await encryptBytes(key, new TextEncoder().encode(VERIFIER_PLAINTEXT)));
  return bytesToBase64(bytes);
}

async function checkVerifier(key: CryptoKey, verifier: string): Promise<void> {
  const plain = await decryptBytes(key, toArrayBuffer(base64ToBytes(verifier)));
  if (new TextDecoder().decode(plain) !== VERIFIER_PLAINTEXT) throw new Error("Passwort ungültig.");
}

export async function createCryptoParams(password: string): Promise<{ crypto: ProtectionCrypto; key: CryptoKey }> {
  const trimmed = password.trim();
  if (!trimmed) throw new Error("Passwort fehlt.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(trimmed, salt, PBKDF2_ITERATIONS);
  return {
    crypto: {
      salt: bytesToBase64(salt),
      iterations: PBKDF2_ITERATIONS,
      verifier: await encryptVerifier(key),
    },
    key,
  };
}

export async function unlockGalleryKey(password: string, params: ProtectionCrypto): Promise<CryptoKey> {
  const trimmed = password.trim();
  if (!trimmed) throw new Error("Passwort ungültig.");
  const salt = base64ToBytes(params.salt);
  const key = await deriveKey(trimmed, salt, params.iterations);
  try {
    await checkVerifier(key, params.verifier);
  } catch {
    throw new Error("Passwort ungültig.");
  }
  return key;
}

export function sessionPasswordKey(salt: string): string {
  return `c2.unlock.${salt}`;
}
