// ── Watermarked photo export ─────────────────────────────────────────────────
// Lets the admin download product photos with the Lucerne Boutique watermark
// burned into the pixels (the storefront only overlays it in CSS, so a plain
// "save image" from the site gives an unprotected photo). Used by the admin
// Products page to export photos ready to publish on social media.
//
// - `watermarkImage(buffer)`  → sharp-composites the brand SVG centered on the
//   photo, scaled to the photo's width, and returns a JPEG buffer.
// - `buildZip(entries)`       → dependency-free ZIP writer (STORE method, no
//   compression — JPEGs don't compress further anyway), so we don't need to
//   add `archiver`/`jszip` to the project.

import sharp from "sharp";

// The exact same butterfly + wordmark used by <ProductWatermark /> on the
// storefront, rendered as a standalone SVG so librsvg (inside sharp) can
// rasterize it. viewBox height leaves room for the wordmark under the logo.
function buildWatermarkSvg(widthPx: number): Buffer {
  // Logo art is 393x297; add a text band below → total design box 393x360.
  const heightPx = Math.round((360 / 393) * widthPx);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="0 0 393 360">
  <ellipse cx="210" cy="120" rx="122" ry="50" transform="rotate(-42 246 132)" fill="#97d5d4"/>
  <ellipse cx="169" cy="240" rx="67" ry="40" transform="rotate(35 176 240)" fill="#f4d3dc"/>
  <ellipse cx="156" cy="200" rx="40" ry="15" transform="rotate(13 160 196)" fill="#f06ee8"/>
  <g transform="translate(0,297) scale(0.1,-0.1)" fill="#1a1a1a" stroke="#1a1a1a" stroke-width="18" stroke-linejoin="round">
    <path d="M2685 2594 c-179 -27 -296 -59 -490 -136 -259 -103 -609 -284 -965
-501 -126 -77 -160 -104 -160 -124 0 -26 34 -12 158 65 434 269 823 464 1138
571 167 57 252 73 379 75 100 1 115 -1 160 -25 105 -53 147 -157 126 -310 -15
-115 -53 -252 -108 -389 -114 -287 -230 -468 -408 -638 -133 -127 -246 -199
-407 -257 -76 -27 -77 -27 -101 -9 -113 89 -164 123 -242 160 -128 61 -190 76
-342 81 -115 5 -141 3 -201 -16 -114 -34 -167 -103 -125 -159 11 -15 37 -37
59 -49 52 -30 240 -89 334 -105 102 -17 356 -17 449 1 l74 15 49 -55 c67 -75
133 -175 176 -267 33 -70 37 -85 37 -163 0 -78 -2 -89 -27 -122 -16 -20 -53
-48 -85 -64 -55 -27 -64 -28 -198 -28 -145 0 -184 8 -345 66 -194 71 -407 241
-518 414 -151 234 -171 410 -152 1340 4 223 3 256 -13 301 -37 107 -122 196
-225 235 -71 26 -176 37 -187 19 -12 -19 23 -40 64 -40 69 0 161 -41 217 -96
57 -57 104 -160 104 -227 0 -39 -17 -49 -39 -24 -6 8 -35 19 -64 26 -103 23
-199 -28 -248 -133 -59 -124 -18 -252 87 -274 60 -13 151 6 196 40 18 14 37
26 42 27 6 0 10 -131 11 -337 2 -555 40 -725 211 -949 208 -272 589 -458 899
-440 163 10 250 52 298 146 64 128 4 322 -165 534 -32 39 -58 75 -58 80 0 4
10 12 23 17 12 5 56 23 99 40 222 90 465 318 620 583 130 221 234 512 257 716
20 186 -46 322 -179 366 -48 16 -166 26 -215 19z m-1854 -495 c30 -12 55 -50
64 -99 9 -50 -36 -135 -92 -174 -34 -23 -53 -29 -102 -30 -53 -1 -64 2 -87 26
-38 37 -44 107 -14 175 45 104 128 141 231 102z m759 -1010 c92 -23 220 -84
294 -139 100 -73 76 -85 -169 -85 -189 1 -281 15 -424 66 -113 39 -145 59
-149 91 -5 38 38 61 173 92 38 9 200 -6 275 -25z"/>
  </g>
  <text x="196.5" y="342" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="900" letter-spacing="8" fill="#1a1a1a">LUCERNE BOUTIQUE</text>
</svg>`;
  return Buffer.from(svg);
}

/**
 * Burns the Lucerne watermark into the center of the photo (same placement as
 * the storefront overlay) and returns a high-quality JPEG.
 */
export async function watermarkImage(input: Buffer): Promise<Buffer> {
  const img = sharp(input, { failOn: "none" }).rotate(); // respect EXIF orientation
  const meta = await img.metadata();
  const w = meta.width || 1000;
  // Same visual proportion as the site's "md" watermark on the main image.
  const wmWidth = Math.max(120, Math.round(w * 0.42));
  const wmSvg = buildWatermarkSvg(wmWidth);
  return img
    .composite([{ input: wmSvg, gravity: "center" }])
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}

// ── Minimal ZIP writer (STORE method) ───────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  /** File name inside the zip — ASCII/latin-safe recommended. */
  name: string;
  data: Buffer;
}

/** Builds an uncompressed (STORE) ZIP file from in-memory entries. */
export function buildZip(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf8");
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // flags: UTF-8 names
    local.writeUInt16LE(0, 8); // method: STORE
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0x21, 12); // mod date (1980-01-01)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18); // compressed size
    local.writeUInt32LE(size, 22); // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra length

    localParts.push(local, nameBuf, entry.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // central dir header signature
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8); // flags: UTF-8 names
    central.writeUInt16LE(0, 10); // method
    central.writeUInt16LE(0, 12); // mod time
    central.writeUInt16LE(0x21, 14); // mod date
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(size, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra len
    central.writeUInt16LE(0, 32); // comment len
    central.writeUInt16LE(0, 34); // disk number
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42); // local header offset

    centralParts.push(central, nameBuf);
    offset += 30 + nameBuf.length + size;
  }

  const centralStart = offset;
  const centralBuf = Buffer.concat(centralParts);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central dir signature
  end.writeUInt16LE(0, 4); // disk number
  end.writeUInt16LE(0, 6); // disk with central dir
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localParts, centralBuf, end]);
}
