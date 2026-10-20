#!/usr/bin/env node
/**
 * Generates the PWA icons in `static/icons/`.
 *
 * The icons are committed to the repository, but they are *generated*: this
 * script is the source of truth and can regenerate them byte-for-byte
 * (`pnpm --filter @vozlab/web icons`). It only uses the Node standard library
 * so the output never depends on a third-party image encoder.
 *
 *   node scripts/generate-icons.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', 'static', 'icons');

/* -------------------------------------------------------------------------- */
/* PNG encoding                                                               */
/* -------------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed), 0);
  return Buffer.concat([length, typed, crc]);
}

/** Encodes 8-bit RGBA pixels as a PNG buffer. */
function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter type: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: truecolour with alpha
  ihdr[10] = 0; // compression: deflate
  ihdr[11] = 0; // filter method: adaptive
  ihdr[12] = 0; // interlace: none

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

/* -------------------------------------------------------------------------- */
/* Drawing                                                                    */
/* -------------------------------------------------------------------------- */

const BACKGROUND = [0x1e, 0x3a, 0x8a]; // #1e3a8a — the manifest theme_color
const NODE = [0xf8, 0xfa, 0xfc];
const EDGE = [0xbf, 0xdb, 0xfe];

/** Normalised (0..1) coordinates of the three graph nodes. */
const NODES = [
  { x: 0.29, y: 0.31 },
  { x: 0.71, y: 0.31 },
  { x: 0.5, y: 0.73 }
];

const NODE_RADIUS = 0.115;
const EDGE_HALF_WIDTH = 0.032;
const CORNER_RADIUS = 0.22;
const SAMPLES = 4; // supersampling factor per axis

function insideRoundedSquare(x, y) {
  const r = CORNER_RADIUS;
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** Returns the colour of a point in the unit square, or `null` for transparency. */
function sample(x, y) {
  if (!insideRoundedSquare(x, y)) {
    return null;
  }

  for (const node of NODES) {
    if (Math.hypot(x - node.x, y - node.y) <= NODE_RADIUS) {
      return NODE;
    }
  }

  for (let i = 0; i < NODES.length; i += 1) {
    for (let j = i + 1; j < NODES.length; j += 1) {
      const a = NODES[i];
      const b = NODES[j];
      if (distanceToSegment(x, y, a.x, a.y, b.x, b.y) <= EDGE_HALF_WIDTH) {
        return EDGE;
      }
    }
  }

  return BACKGROUND;
}

function renderIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const step = 1 / (size * SAMPLES);

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const x = (px * SAMPLES + sx + 0.5) * step;
          const y = (py * SAMPLES + sy + 0.5) * step;
          const colour = sample(x, y);
          if (colour) {
            r += colour[0];
            g += colour[1];
            b += colour[2];
            a += 255;
          }
        }
      }

      const samples = SAMPLES * SAMPLES;
      const offset = (py * size + px) * 4;
      const alpha = a / samples;
      // Premultiplied averaging keeps the antialiased edges free of halos.
      const coverage = a === 0 ? 0 : a / (255 * samples);
      rgba[offset] = coverage === 0 ? 0 : Math.round(r / (samples * coverage));
      rgba[offset + 1] = coverage === 0 ? 0 : Math.round(g / (samples * coverage));
      rgba[offset + 2] = coverage === 0 ? 0 : Math.round(b / (samples * coverage));
      rgba[offset + 3] = Math.round(alpha);
    }
  }

  return encodePng(size, size, rgba);
}

/* -------------------------------------------------------------------------- */

mkdirSync(OUT_DIR, { recursive: true });

for (const size of [192, 512]) {
  const file = join(OUT_DIR, `icon-${size}.png`);
  writeFileSync(file, renderIcon(size));
  console.log(`wrote ${file}`);
}
