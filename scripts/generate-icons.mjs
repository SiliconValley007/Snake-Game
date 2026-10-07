import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const dir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "icons",
);
mkdirSync(dir, { recursive: true });

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function png(w, h, paint) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[(w * 3 + 1) * y] = 0;
    for (let x = 0; x < w; x++) {
      const rgb = paint(x, y, w, h);
      const i = (w * 3 + 1) * y + 1 + x * 3;
      raw[i] = rgb[0];
      raw[i + 1] = rgb[1];
      raw[i + 2] = rgb[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function iconPaint(maskable) {
  return (x, y, size) => {
    const cx = (size - 1) / 2;
    const cy = (size - 1) / 2;
    const dx = (x - cx) / size;
    const dy = (y - cy) / size;
    const d = Math.hypot(dx, dy);
    const pad = maskable ? 0.42 : 0.48;
    let r = 7,
      g = 11,
      b = 20;
    if (d < pad) {
      const t = 1 - d / pad;
      r = (7 + 27 * t) | 0;
      g = (11 + 186 * t) | 0;
      b = (20 + 74 * t) | 0;
      if (Math.abs(dy) < 0.08 && dx > -0.22 && dx < 0.28) {
        r = 236;
        g = 255;
        b = 232;
      }
    }
    return [r, g, b];
  };
}

function ogPaint(x, y, w, h) {
  const nx = x / (w - 1);
  const ny = y / (h - 1);
  let r = (7 + 16 * nx) | 0;
  let g = (11 + 28 * (1 - ny)) | 0;
  let b = (20 + 36 * nx) | 0;
  const cx = w * 0.5;
  const cy = h * 0.5;
  const dx = (x - cx) / h;
  const dy = (y - cy) / h;
  const d = Math.hypot(dx, dy);
  if (d < 0.28) {
    const t = 1 - d / 0.28;
    r = (7 + 27 * t) | 0;
    g = (11 + 186 * t) | 0;
    b = (20 + 74 * t) | 0;
    if (Math.abs(dy) < 0.05 && dx > -0.14 && dx < 0.18) {
      r = 236;
      g = 255;
      b = 232;
    }
  }
  return [r, g, b];
}

writeFileSync(join(dir, "icon-192.png"), png(192, 192, iconPaint(false)));
writeFileSync(join(dir, "icon-512.png"), png(512, 512, iconPaint(false)));
writeFileSync(
  join(dir, "icon-maskable-192.png"),
  png(192, 192, iconPaint(true)),
);
writeFileSync(
  join(dir, "icon-maskable-512.png"),
  png(512, 512, iconPaint(true)),
);
writeFileSync(join(dir, "og-card.png"), png(1200, 630, ogPaint));
console.log("icons written");
