export type JpegExif = {
  takenAt?: string;
  camera?: string;
  focalLength?: string;
};

function readAscii(view: DataView, offset: number, length: number): string {
  let s = "";
  for (let i = 0; i < length; i += 1) {
    const c = view.getUint8(offset + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
}

function exifDateToIso(value: string): string | undefined {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value);
  if (!m) return undefined;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
}

type Reader = {
  view: DataView;
  le: boolean;
  tiff: number;
};

function u16(r: Reader, offset: number): number {
  return r.view.getUint16(offset, r.le);
}

function u32(r: Reader, offset: number): number {
  return r.view.getUint32(offset, r.le);
}

function readTagValue(r: Reader, entry: number): string | number | undefined {
  const type = u16(r, entry + 2);
  const count = u32(r, entry + 4);
  const valueOff = entry + 8;
  const size = type === 3 ? 2 : type === 4 || type === 9 ? 4 : type === 5 || type === 10 ? 8 : 1;
  const nbytes = size * count;
  const dataOffset = nbytes <= 4 ? valueOff : r.tiff + u32(r, valueOff);

  if (type === 2) return readAscii(r.view, dataOffset, count);
  if (type === 3) return u16(r, nbytes <= 4 ? valueOff : dataOffset);
  if (type === 4) return u32(r, nbytes <= 4 ? valueOff : dataOffset);
  if (type === 5) {
    const num = u32(r, dataOffset);
    const den = u32(r, dataOffset + 4);
    if (!den) return undefined;
    return num / den;
  }
  if (type === 10) {
    const num = r.view.getInt32(dataOffset, r.le);
    const den = r.view.getInt32(dataOffset + 4, r.le);
    if (!den) return undefined;
    return num / den;
  }
  return undefined;
}

function readIfd(r: Reader, ifdOffset: number, wanted: Set<number>): Map<number, string | number> {
  const map = new Map<number, string | number>();
  if (ifdOffset <= 0 || ifdOffset + 2 > r.view.byteLength) return map;
  const count = u16(r, r.tiff + ifdOffset);
  for (let i = 0; i < count; i += 1) {
    const entry = r.tiff + ifdOffset + 2 + i * 12;
    if (entry + 12 > r.view.byteLength) break;
    const tag = u16(r, entry);
    if (!wanted.has(tag)) continue;
    const value = readTagValue(r, entry);
    if (value !== undefined) map.set(tag, value);
  }
  return map;
}

export function readJpegExif(buffer: ArrayBuffer): JpegExif | null {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;

  let offset = 2;
  while (offset + 4 < view.byteLength) {
    if (view.getUint8(offset) !== 0xff) break;
    const marker = view.getUint8(offset + 1);
    const size = view.getUint16(offset + 2);
    if (marker === 0xe1) {
      const start = offset + 4;
      if (readAscii(view, start, 4) !== "Exif") return null;
      const tiff = start + 6;
      const endian = view.getUint16(tiff);
      const le = endian === 0x4949;
      if (!le && endian !== 0x4d4d) return null;
      const r: Reader = { view, le, tiff };
      const ifd0 = u32(r, tiff + 4);
      const wanted0 = new Set([0x010f, 0x0110, 0x8769]);
      const ifd0map = readIfd(r, ifd0, wanted0);
      const exifOff = ifd0map.get(0x8769);
      const wantedExif = new Set([0x9003, 0x920a]);
      const exifMap =
        typeof exifOff === "number" ? readIfd(r, exifOff, wantedExif) : new Map<number, string | number>();

      const make = typeof ifd0map.get(0x010f) === "string" ? String(ifd0map.get(0x010f)) : "";
      const model = typeof ifd0map.get(0x0110) === "string" ? String(ifd0map.get(0x0110)) : "";
      let camera = `${make} ${model}`.trim();
      if (make && model.toLowerCase().startsWith(make.toLowerCase())) camera = model;

      const dateRaw = exifMap.get(0x9003);
      const focal = exifMap.get(0x920a);
      const result: JpegExif = {};
      if (typeof dateRaw === "string") {
        const iso = exifDateToIso(dateRaw);
        if (iso) result.takenAt = iso;
      }
      if (camera) result.camera = camera;
      if (typeof focal === "number" && Number.isFinite(focal)) {
        result.focalLength = `${Math.round(focal * 10) / 10}mm`;
      }
      return result;
    }
    if (marker === 0xda) break;
    offset += 2 + size;
  }
  return null;
}

export async function readFileExif(file: File): Promise<JpegExif | null> {
  const name = file.name.toLowerCase();
  if (!name.endsWith(".jpg") && !name.endsWith(".jpeg")) return null;
  const slice = file.slice(0, Math.min(file.size, 128 * 1024));
  const buffer = await slice.arrayBuffer();
  return readJpegExif(buffer);
}
