// =============================================================================
// Generate PWA icon PNGs (192×192 and 512×512) using pure Node.js
// Called during `npm run build` before Vite bundles the app.
// =============================================================================
"use strict";

const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

const THEME = [30, 27, 46];     // #1e1b2e dark purple
const ACCENT = [124, 92, 198];  // #7c5cc6 purple accent
const WHITE = [255, 255, 255];
const OUTPUT_DIR = path.join(__dirname, "public");

// ---------------------------------------------------------------------------
// Minimal PNG writer (no dependencies, same pattern as placeholder_map.png)
// ---------------------------------------------------------------------------
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const c = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(c) >>> 0);
  return Buffer.concat([len, c, crc]);
}

function createPNG(width, height, pixelRows) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = pngChunk("IHDR", ihdrData);

  const raw = Buffer.concat(pixelRows.map((row) => Buffer.concat([Buffer.from([0]), row])));
  const idat = pngChunk("IDAT", zlib.deflateSync(raw));
  const iend = pngChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([sig, ihdr, idat, iend]);
}

// ---------------------------------------------------------------------------
// Icon drawing — geometric "T" shape on a rounded-rect background
// ---------------------------------------------------------------------------
function generateIcon(size) {
  const channels = 4; // RGBA
  const stride = size * channels;
  const pixels = Buffer.alloc(size * stride);
  const radius = Math.round(size * 0.2);

  // Helper: distance from corner center
  function isInRoundedRect(x, y) {
    const minR = radius;
    const maxX = size - radius;
    const maxY = size - radius;

    if (x >= radius && x < maxX && y >= radius && y < maxY) return true;
    if (x < radius) {
      if (y < radius) return (x - radius) ** 2 + (y - radius) ** 2 <= radius * radius;
      if (y >= maxY) return (x - radius) ** 2 + (y - maxY) ** 2 <= radius * radius;
      return x >= 0;
    }
    if (x >= maxX) {
      if (y < radius) return (x - maxX) ** 2 + (y - radius) ** 2 <= radius * radius;
      if (y >= maxY) return (x - maxX) ** 2 + (y - maxY) ** 2 <= radius * radius;
      return x < size;
    }
    return y >= 0 && y < size;
  }

  // "T" letter parameters
  const barThick = Math.round(size * 0.18);   // horizontal bar thickness
  const stemWide = Math.round(size * 0.18);     // vertical stem width
  const barY = Math.round(size * 0.22);          // top bar Y center
  const padX = Math.round(size * 0.18);          // horizontal padding

  for (let y = 0; y < size; y++) {
    const rowOffset = y * stride;
    for (let x = 0; x < size; x++) {
      const off = rowOffset + x * channels;

      if (!isInRoundedRect(x, y)) {
        // Transparent outside the rounded rect
        pixels[off] = THEME[0];
        pixels[off + 1] = THEME[1];
        pixels[off + 2] = THEME[2];
        pixels[off + 3] = 0;
        continue;
      }

      // Background
      pixels[off] = THEME[0];
      pixels[off + 1] = THEME[1];
      pixels[off + 2] = THEME[2];
      pixels[off + 3] = 255;

      // ---- Draw the "T" letter ----
      // Top horizontal bar
      const barTop = barY - Math.floor(barThick / 2);
      const barBottom = barY + Math.ceil(barThick / 2);
      if (y >= barTop && y < barBottom && x >= padX && x < size - padX) {
        pixels[off] = WHITE[0];
        pixels[off + 1] = WHITE[1];
        pixels[off + 2] = WHITE[2];
      }

      // Vertical stem
      const stemLeft = Math.floor(size / 2 - stemWide / 2);
      const stemRight = Math.ceil(size / 2 + stemWide / 2);
      const stemTop = barY;
      const stemBottom = Math.round(size * 0.72);
      if (y >= stemTop && y < stemBottom && x >= stemLeft && x < stemRight) {
        pixels[off] = WHITE[0];
        pixels[off + 1] = WHITE[1];
        pixels[off + 2] = WHITE[2];
      }

      // Subtle accent glow behind the T
      const cx = size / 2;
      const cy = size / 2;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const maxDist = size * 0.55;
      if (dist < maxDist) {
        const alpha = Math.round((1 - dist / maxDist) * 25);
        if (alpha > 0) {
          pixels[off] = Math.min(255, pixels[off] + Math.round(ACCENT[0] * alpha / 255));
          pixels[off + 1] = Math.min(255, pixels[off + 1] + Math.round(ACCENT[1] * alpha / 255));
          pixels[off + 2] = Math.min(255, pixels[off + 2] + Math.round(ACCENT[2] * alpha / 255));
        }
      }
    }
  }

  // Split pixels into rows for the PNG format (filter byte per row)
  const rows = [];
  for (let y = 0; y < size; y++) {
    rows.push(pixels.slice(y * stride, (y + 1) * stride));
  }

  return createPNG(size, size, rows);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const sizes = [192, 512];
for (const size of sizes) {
  const png = generateIcon(size);
  const outPath = path.join(OUTPUT_DIR, `pwa-${size}x${size}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`[PWA Icons] Generated ${outPath} (${png.length} bytes)`);
}

console.log("[PWA Icons] Done.");
