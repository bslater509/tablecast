const fs = require('fs');
const path = require('path');
const PNG = require('pngjs').PNG;

const defaultThemePath = path.join(__dirname, 'public', 'assets', 'dice-box', 'themes', 'default', 'diffuse-light.png');
const rawTexturesDir = path.join(__dirname, 'src', 'assets', 'raw-textures');
const themesDir = path.join(__dirname, 'public', 'assets', 'dice-box', 'themes');
const themesDir2 = path.join(__dirname, 'public', 'assets', 'themes');

// Standard noise functions for procedural fallbacks
function hash(x, y) {
  let h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453123;
  return h - Math.floor(h);
}

function noise(x, y) {
  let ix = Math.floor(x);
  let iy = Math.floor(y);
  let fx = x - ix;
  let fy = y - iy;

  // Smoothstep interpolation
  let ux = fx * fx * (3.0 - 2.0 * fx);
  let uy = fy * fy * (3.0 - 2.0 * fy);

  let a = hash(ix, iy);
  let b = hash(ix + 1, iy);
  let c = hash(ix, iy + 1);
  let d = hash(ix + 1, iy + 1);

  return a * (1 - ux) * (1 - uy) +
         b * ux * (1 - uy) +
         c * (1 - ux) * uy +
         d * ux * uy;
}

function fbm(x, y, octaves = 4) {
  let value = 0.0;
  let amplitude = 0.5;
  let frequency = 1.0;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise(x * frequency, y * frequency);
    frequency *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

const THEME_TEXTURE_PROFILES = {
  glass: {
    label: { r: 240, g: 253, b: 255 },
    labelLow: { r: 96, g: 165, b: 250 },
    darkLabel: { r: 207, g: 250, b: 254 },
    darkLabelLow: { r: 34, g: 211, b: 238 }
  },
  gold: {
    label: { r: 55, g: 33, b: 7 },
    labelLow: { r: 146, g: 64, b: 14 },
    darkLabel: { r: 254, g: 243, b: 199 },
    darkLabelLow: { r: 217, g: 119, b: 6 }
  },
  magma: {
    label: { r: 255, g: 247, b: 237 },
    labelLow: { r: 251, g: 146, b: 60 },
    darkLabel: { r: 255, g: 237, b: 213 },
    darkLabelLow: { r: 234, g: 88, b: 12 }
  },
  obsidian: {
    label: { r: 226, g: 232, b: 240 },
    labelLow: { r: 100, g: 116, b: 139 },
    darkLabel: { r: 248, g: 250, b: 252 },
    darkLabelLow: { r: 148, g: 163, b: 184 }
  },
  stone: {
    label: { r: 243, g: 244, b: 246 },
    labelLow: { r: 107, g: 114, b: 128 },
    darkLabel: { r: 229, g: 231, b: 235 },
    darkLabelLow: { r: 75, g: 85, b: 99 }
  },
  ice: {
    label: { r: 248, g: 250, b: 252 },
    labelLow: { r: 125, g: 211, b: 252 },
    darkLabel: { r: 224, g: 242, b: 254 },
    darkLabelLow: { r: 56, g: 189, b: 248 }
  },
  wood: {
    label: { r: 254, g: 243, b: 199 },
    labelLow: { r: 217, g: 119, b: 6 },
    darkLabel: { r: 253, g: 224, b: 71 },
    darkLabelLow: { r: 146, g: 64, b: 14 }
  }
};

function clamp(value, min = 0, max = 255) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function mixColor(a, b, t) {
  return {
    r: clamp(a.r * (1 - t) + b.r * t),
    g: clamp(a.g * (1 - t) + b.g * t),
    b: clamp(a.b * (1 - t) + b.b * t)
  };
}

function colorizeLabel(profile, sourcePng, idx, isDark) {
  const high = isDark ? profile.darkLabel : profile.label;
  const low = isDark ? profile.darkLabelLow : profile.labelLow;
  const luminance = (
    sourcePng.data[idx] * 0.2126 +
    sourcePng.data[idx + 1] * 0.7152 +
    sourcePng.data[idx + 2] * 0.0722
  ) / 255;
  return mixColor(low, high, Math.max(0.18, luminance));
}

// Procedural generators for themes
function getProceduralColor(theme, x, y) {
  if (theme === 'glass') {
    const nx = x * 0.022;
    const ny = y * 0.022;
    const n = fbm(nx, ny, 5);
    const shard = Math.abs(Math.sin((x + y * 1.7) * 0.028 + n * 4.0));
    const glint = shard > 0.94 ? 58 : 0;
    return {
      r: clamp(176 + n * 34 + glint),
      g: clamp(232 + n * 18 + glint),
      b: 255
    };
  } else if (theme === 'gold') {
    const nx = x * 0.018;
    const ny = y * 0.018;
    const grain = fbm(nx, ny, 5);
    const streak = Math.sin(x * 0.045 + grain * 4.5) * 0.5 + 0.5;
    return {
      r: clamp(184 + grain * 56 + streak * 20),
      g: clamp(112 + grain * 66 + streak * 34),
      b: clamp(22 + grain * 38)
    };
  } else if (theme === 'obsidian') {
    const nx = x * 0.016;
    const ny = y * 0.016;
    const smoke = fbm(nx, ny, 6);
    const edge = Math.abs(Math.sin((x - y) * 0.018 + smoke * 5.5));
    const glint = edge > 0.965 ? 70 : 0;
    return {
      r: clamp(5 + smoke * 20 + glint),
      g: clamp(9 + smoke * 24 + glint),
      b: clamp(18 + smoke * 34 + glint)
    };
  } else if (theme === 'wood') {
    let nx = (x - 512) * 0.015;
    let ny = (y - 512) * 0.015;
    let dist = Math.sqrt(nx * nx + ny * ny);
    let woodNoise = fbm(nx * 1.5, ny * 1.5, 4) * 0.7;
    let rings = Math.sin((dist * 5.2 + woodNoise * 6.2) * 1.65);
    let grain = Math.sin((x * 0.035) + woodNoise * 4.5) * 0.5 + 0.5;
    let t = (rings + 1) * 0.5;
    return {
      r: clamp(196 * (1 - t) + 82 * t + grain * 18),
      g: clamp(124 * (1 - t) + 45 * t + grain * 10),
      b: clamp(57 * (1 - t) + 20 * t)
    };
  } else if (theme === 'stone') {
    let nx = x * 0.02;
    let ny = y * 0.02;
    let stoneNoise = fbm(nx, ny, 5);
    let cracks = Math.abs(fbm(nx * 2.6, ny * 2.6, 4) - 0.48);
    let crackVal = cracks < 0.035 ? 0.45 : 1.0;
    let val = clamp((92 + stoneNoise * 104) * crackVal);
    return { r: val, g: clamp(val + 3), b: clamp(val + 8) };
  } else if (theme === 'magma') {
    let nx = x * 0.012;
    let ny = y * 0.012;
    let n = fbm(nx, ny, 5);
    let vein = Math.abs(Math.sin((x * 0.018) + (y * 0.024) + n * 8.0));
    if (n > 0.58 || vein > 0.965) {
      let t = Math.max((n - 0.58) / 0.42, (vein - 0.965) / 0.035);
      return {
        r: 255,
        g: clamp(74 + t * 174),
        b: clamp(4 + t * 48)
      };
    } else {
      let val = clamp(18 + n * 42);
      return { r: clamp(val + 8), g: val, b: clamp(val - 4) };
    }
  } else if (theme === 'ice') {
    let nx = x * 0.018;
    let ny = y * 0.018;
    let n = fbm(nx, ny, 5);
    let facet = Math.abs(Math.sin((x * 0.026) - (y * 0.034) + n * 5.0));
    let highlight = facet > 0.94 ? 42 : 0;
    return {
      r: clamp(164 + n * 54 + highlight),
      g: clamp(220 + n * 28 + highlight),
      b: 255
    };
  } else {
    // Fallback default white
    return { r: 255, g: 255, b: 255 };
  }
}

// Generate the customized theme texture
function generateThemeTexture(theme) {
  const themeDestDir = path.join(themesDir, theme);
  if (!fs.existsSync(themeDestDir)) {
    fs.mkdirSync(themeDestDir, { recursive: true });
  }
  const themeDestDir2 = path.join(themesDir2, theme);
  if (!fs.existsSync(themeDestDir2)) {
    fs.mkdirSync(themeDestDir2, { recursive: true });
  }

  const destPath = path.join(themeDestDir, 'diffuse-light.png');
  const destPathDark = path.join(themeDestDir, 'diffuse-dark.png');
  const destPath2 = path.join(themeDestDir2, 'diffuse-light.png');
  const destPath2Dark = path.join(themeDestDir2, 'diffuse-dark.png');
  const rawPath = path.join(rawTexturesDir, `${theme}-pattern.png`);

  if (!fs.existsSync(defaultThemePath)) {
    console.error(`[Dice Textures] Default diffuse map not found: ${defaultThemePath}`);
    return;
  }

  const defaultPng = PNG.sync.read(fs.readFileSync(defaultThemePath));
  const { width, height } = defaultPng;
  const outPng = new PNG({ width, height });
  const outDarkPng = new PNG({ width, height });
  const profile = THEME_TEXTURE_PROFILES[theme] || THEME_TEXTURE_PROFILES.glass;

  let rawPng = null;
  if (fs.existsSync(rawPath)) {
    try {
      rawPng = PNG.sync.read(fs.readFileSync(rawPath));
      console.log(`[Dice Textures] Using raw seamless texture for ${theme}: ${rawPath}`);
    } catch (e) {
      console.error(`[Dice Textures] Failed to read raw texture for ${theme}:`, e);
    }
  } else {
    console.log(`[Dice Textures] Generating procedural fallback texture for ${theme}...`);
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      const alpha = defaultPng.data[idx + 3];

      if (alpha > 0) {
        const labelColor = colorizeLabel(profile, defaultPng, idx, false);
        const darkLabelColor = colorizeLabel(profile, defaultPng, idx, true);

        outPng.data[idx] = labelColor.r;
        outPng.data[idx + 1] = labelColor.g;
        outPng.data[idx + 2] = labelColor.b;
        outPng.data[idx + 3] = defaultPng.data[idx + 3];

        outDarkPng.data[idx] = darkLabelColor.r;
        outDarkPng.data[idx + 1] = darkLabelColor.g;
        outDarkPng.data[idx + 2] = darkLabelColor.b;
        outDarkPng.data[idx + 3] = defaultPng.data[idx + 3];
      } else {
        // Background/Body: get color from raw image or fallback noise generator
        let color;
        if (rawPng) {
          const rx = x % rawPng.width;
          const ry = y % rawPng.height;
          const rawIdx = (rawPng.width * ry + rx) << 2;
          color = {
            r: rawPng.data[rawIdx],
            g: rawPng.data[rawIdx + 1],
            b: rawPng.data[rawIdx + 2]
          };
        } else {
          color = getProceduralColor(theme, x, y);
        }

        outPng.data[idx] = color.r;
        outPng.data[idx + 1] = color.g;
        outPng.data[idx + 2] = color.b;
        outPng.data[idx + 3] = 0; // Alpha MUST be 0 so we can tint it dynamically in standard/color shaders!

        const darkColor = {
          r: clamp(color.r * 0.68),
          g: clamp(color.g * 0.68),
          b: clamp(color.b * 0.72)
        };
        outDarkPng.data[idx] = darkColor.r;
        outDarkPng.data[idx + 1] = darkColor.g;
        outDarkPng.data[idx + 2] = darkColor.b;
        outDarkPng.data[idx + 3] = 0;
      }
    }
  }

  const outBuffer = PNG.sync.write(outPng);
  const outDarkBuffer = PNG.sync.write(outDarkPng);
  fs.writeFileSync(destPath, outBuffer);
  fs.writeFileSync(destPathDark, outDarkBuffer);
  fs.writeFileSync(destPath2, outBuffer);
  fs.writeFileSync(destPath2Dark, outDarkBuffer);
  console.log(`[Dice Textures] Successfully wrote customized atlases to ${destPath}, ${destPathDark}, ${destPath2}, and ${destPath2Dark}`);
}

console.log('[Dice Textures] Starting customized atlas texture generation...');
const themesToGenerate = ['glass', 'gold', 'magma', 'obsidian', 'stone', 'ice', 'wood'];
try {
  if (!fs.existsSync(rawTexturesDir)) {
    fs.mkdirSync(rawTexturesDir, { recursive: true });
  }
  themesToGenerate.forEach(generateThemeTexture);
} catch (err) {
  console.error('[Dice Textures] Error during texture generation:', err);
}
