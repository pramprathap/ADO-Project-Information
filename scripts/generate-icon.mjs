/**
 * Generates the extension icon (public/icons/extension-icon.png) with no
 * third-party dependencies, using Node's built-in zlib to encode a PNG.
 *
 * The icon is a simple, theme-neutral "project card" glyph on an Azure-DevOps
 * blue background. Re-run with `npm run icons` if you want to regenerate it.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SIZE = 128;

// Colours (r, g, b).
const BG = [31, 111, 235]; // Azure DevOps blue
const CARD = [255, 255, 255];
const LINE = [31, 111, 235];

function makePixels() {
  const px = Buffer.alloc(SIZE * SIZE * 4);
  const set = (x, y, [r, g, b], a = 255) => {
    const i = (y * SIZE + x) * 4;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = a;
  };

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      set(x, y, BG);
    }
  }

  // White card.
  const cardX0 = 30,
    cardY0 = 26,
    cardX1 = 98,
    cardY1 = 102;
  for (let y = cardY0; y < cardY1; y++) {
    for (let x = cardX0; x < cardX1; x++) {
      set(x, y, CARD);
    }
  }

  // Three "text lines" on the card.
  const drawLine = (y, x0, x1) => {
    for (let yy = y; yy < y + 6; yy++) {
      for (let x = x0; x < x1; x++) {
        set(x, yy, LINE);
      }
    }
  };
  drawLine(42, 40, 88);
  drawLine(60, 40, 78);
  drawLine(78, 40, 84);

  return px;
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(pixels) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Add filter byte (0) per scanline.
  const stride = SIZE * 4;
  const raw = Buffer.alloc((stride + 1) * SIZE);
  for (let y = 0; y < SIZE; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw);

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = resolve(__dirname, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });
const out = resolve(outDir, 'extension-icon.png');
writeFileSync(out, encodePng(makePixels()));
console.log(`Wrote ${out}`);
