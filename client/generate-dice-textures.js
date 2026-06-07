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

// Procedural generators for themes
function getProceduralColor(theme, x, y) {
  if (theme === 'wood') {
    let nx = (x - 512) * 0.015;
    let ny = (y - 512) * 0.015;
    let dist = Math.sqrt(nx * nx + ny * ny);
    let woodNoise = fbm(nx * 1.5, ny * 1.5, 4) * 0.7;
    let rings = Math.sin((dist * 4.0 + woodNoise * 5.0) * 1.5);
    let t = (rings + 1) * 0.5;
    // Blend light brown wood grain to dark brown wood grain
    return {
      r: Math.floor(210 * (1 - t) + 110 * t),
      g: Math.floor(165 * (1 - t) + 70 * t),
      b: Math.floor(115 * (1 - t) + 35 * t)
    };
  } else if (theme === 'stone') {
    let nx = x * 0.02;
    let ny = y * 0.02;
    let stoneNoise = fbm(nx, ny, 5);
    let cracks = fbm(nx * 2.0, ny * 2.0, 3);
    let crackVal = cracks > 0.75 ? 0.4 : 1.0;
    let val = Math.floor((110 + stoneNoise * 90) * crackVal);
    // Dark grey stone with texture cracks
    return { r: val, g: val, b: val };
  } else if (theme === 'magma') {
    let nx = x * 0.012;
    let ny = y * 0.012;
    let n = fbm(nx, ny, 4);
    if (n > 0.55) {
      // Hot lava vein
      let t = (n - 0.55) / 0.45;
      return {
        r: 255,
        g: Math.floor(65 + t * 160),
        b: Math.floor(t * 40)
      };
    } else {
      // Basalt dark rock background
      let val = Math.floor(25 + n * 45);
      return { r: val, g: val, b: val };
    }
  } else if (theme === 'ice') {
    let nx = x * 0.018;
    let ny = y * 0.018;
    let n = fbm(nx, ny, 4);
    // Ice crystalline light blue
    return {
      r: Math.floor(170 + n * 55),
      g: Math.floor(220 + n * 30),
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
  const destPath2 = path.join(themeDestDir2, 'diffuse-light.png');
  const rawPath = path.join(rawTexturesDir, `${theme}-pattern.png`);

  if (!fs.existsSync(defaultThemePath)) {
    console.error(`[Dice Textures] Default diffuse map not found: ${defaultThemePath}`);
    return;
  }

  const defaultPng = PNG.sync.read(fs.readFileSync(defaultThemePath));
  const { width, height } = defaultPng;
  const outPng = new PNG({ width, height });

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
        // Numbers: keep white from default numbers atlas
        outPng.data[idx] = defaultPng.data[idx];
        outPng.data[idx + 1] = defaultPng.data[idx + 1];
        outPng.data[idx + 2] = defaultPng.data[idx + 2];
        outPng.data[idx + 3] = defaultPng.data[idx + 3];
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
      }
    }
  }

  const outBuffer = PNG.sync.write(outPng);
  fs.writeFileSync(destPath, outBuffer);
  fs.writeFileSync(destPath2, outBuffer);
  console.log(`[Dice Textures] Successfully wrote customized atlas to ${destPath} and ${destPath2}`);
}

console.log('[Dice Textures] Starting customized atlas texture generation...');
const themesToGenerate = ['wood', 'stone', 'magma', 'ice'];
try {
  if (!fs.existsSync(rawTexturesDir)) {
    fs.mkdirSync(rawTexturesDir, { recursive: true });
  }
  themesToGenerate.forEach(generateThemeTexture);
} catch (err) {
  console.error('[Dice Textures] Error during texture generation:', err);
}
