"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");
const os = require("os");
const prisma = require("../src/prisma");

const AUDIO_DIR = path.join(__dirname, "../uploads/audio");
const TMP_DIR = path.join(os.tmpdir(), "tablecast-seed-" + crypto.randomUUID().substring(0, 8));

const KENNEY_PACKS = [
  {
    name: "rpg-audio",
    url: "https://www.kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip",
  },
  {
    name: "impact-sounds",
    url: "https://www.kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip",
  },
  {
    name: "music-jingles",
    url: "https://www.kenney.nl/media/pages/assets/music-jingles/f37e530b9e-1677590399/kenney_music-jingles.zip",
  },
  {
    name: "sci-fi-sounds",
    url: "https://www.kenney.nl/media/pages/assets/sci-fi-sounds/6b296f9ecf-1677589334/kenney_sci-fi-sounds.zip",
  },
];

if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

const CATEGORY_RULES = [
  { pattern: /sword/i, category: "COMBAT" },
  { pattern: /knife/i, category: "COMBAT" },
  { pattern: /slash/i, category: "COMBAT" },
  { pattern: /slice/i, category: "COMBAT" },
  { pattern: /punch/i, category: "COMBAT" },
  { pattern: /explosion/i, category: "COMBAT" },
  { pattern: /impactMetal|impactPlate/i, category: "COMBAT" },
  { pattern: /laser/i, category: "COMBAT" },
  { pattern: /combat/i, category: "COMBAT" },
  { pattern: /battle/i, category: "COMBAT" },
  { pattern: /weapon/i, category: "COMBAT" },
  { pattern: /shield/i, category: "COMBAT" },
  { pattern: /arrow/i, category: "COMBAT" },
  { pattern: /bow/i, category: "COMBAT" },
  { pattern: /axe/i, category: "COMBAT" },
  { pattern: /hammer/i, category: "COMBAT" },
  { pattern: /jingles_HIT/i, category: "COMBAT" },

  { pattern: /footstep.*(grass|snow|dirt|mud|leaves|sand)/i, category: "WILDERNESS" },
  { pattern: /footstep.*(wood|concrete|carpet|stone)/i, category: "EXPLORATION" },
  { pattern: /footstep/i, category: "EXPLORATION" },
  { pattern: /door/i, category: "EXPLORATION" },
  { pattern: /creak/i, category: "EXPLORATION" },
  { pattern: /book/i, category: "EXPLORATION" },
  { pattern: /coin/i, category: "EXPLORATION" },
  { pattern: /treasure/i, category: "EXPLORATION" },
  { pattern: /chest/i, category: "EXPLORATION" },
  { pattern: /lever/i, category: "EXPLORATION" },
  { pattern: /trap/i, category: "EXPLORATION" },
  { pattern: /puzzle/i, category: "EXPLORATION" },
  { pattern: /cloth/i, category: "EXPLORATION" },
  { pattern: /belt/i, category: "EXPLORATION" },
  { pattern: /metalClick|metalLatch/i, category: "EXPLORATION" },
  { pattern: /draw/i, category: "EXPLORATION" },
  { pattern: /dropLeather|handleSmall|handleCoins/i, category: "EXPLORATION" },
  { pattern: /chop/i, category: "EXPLORATION" },
  { pattern: /potion/i, category: "EXPLORATION" },
  { pattern: /magic/i, category: "EXPLORATION" },
  { pattern: /impactWood/i, category: "EXPLORATION" },
  { pattern: /impactGeneric/i, category: "EXPLORATION" },

  { pattern: /bell/i, category: "TOWN" },
  { pattern: /market/i, category: "TOWN" },
  { pattern: /crowd/i, category: "TOWN" },
  { pattern: /town/i, category: "TOWN" },
  { pattern: /village/i, category: "TOWN" },
  { pattern: /blacksmith/i, category: "TOWN" },
  { pattern: /metalPot/i, category: "TOWN" },
  { pattern: /church/i, category: "TOWN" },
  { pattern: /temple/i, category: "TOWN" },
  { pattern: /jingles_NES/i, category: "TOWN" },

  { pattern: /impactGlass/i, category: "TAVERN" },
  { pattern: /glass/i, category: "TAVERN" },
  { pattern: /tavern/i, category: "TAVERN" },
  { pattern: /inn/i, category: "TAVERN" },
  { pattern: /bard/i, category: "TAVERN" },
  { pattern: /drink/i, category: "TAVERN" },
  { pattern: /lute/i, category: "TAVERN" },
  { pattern: /mug/i, category: "TAVERN" },
  { pattern: /fireplace/i, category: "TAVERN" },
  { pattern: /hearth/i, category: "TAVERN" },
  { pattern: /jingles_PIZZI/i, category: "TAVERN" },

  { pattern: /slime/i, category: "DUNGEON" },
  { pattern: /dungeon/i, category: "DUNGEON" },
  { pattern: /cave/i, category: "DUNGEON" },
  { pattern: /crypt/i, category: "DUNGEON" },
  { pattern: /tomb/i, category: "DUNGEON" },
  { pattern: /underground/i, category: "DUNGEON" },
  { pattern: /dark/i, category: "DUNGEON" },
  { pattern: /eerie/i, category: "DUNGEON" },
  { pattern: /horror/i, category: "DUNGEON" },
  { pattern: /creep/i, category: "DUNGEON" },
  { pattern: /spaceEngine/i, category: "DUNGEON" },
  { pattern: /computerNoise/i, category: "DUNGEON" },
  { pattern: /forceField/i, category: "DUNGEON" },
  { pattern: /lowFrequency/i, category: "DUNGEON" },

  { pattern: /grass/i, category: "WILDERNESS" },
  { pattern: /snow/i, category: "WILDERNESS" },
  { pattern: /carpet/i, category: "WILDERNESS" },
  { pattern: /forest/i, category: "WILDERNESS" },
  { pattern: /wilderness/i, category: "WILDERNESS" },
  { pattern: /nature/i, category: "WILDERNESS" },
  { pattern: /wind/i, category: "WILDERNESS" },
  { pattern: /water/i, category: "WILDERNESS" },
  { pattern: /river/i, category: "WILDERNESS" },
  { pattern: /rain/i, category: "WILDERNESS" },
  { pattern: /swamp/i, category: "WILDERNESS" },
  { pattern: /desert/i, category: "WILDERNESS" },
  { pattern: /jungle/i, category: "WILDERNESS" },
  { pattern: /mountain/i, category: "WILDERNESS" },
  { pattern: /animal/i, category: "WILDERNESS" },
  { pattern: /bird/i, category: "WILDERNESS" },
  { pattern: /leaves/i, category: "WILDERNESS" },

  { pattern: /engineCircular/i, category: "AMBIENT" },
  { pattern: /ambient/i, category: "AMBIENT" },
  { pattern: /atmosphere/i, category: "AMBIENT" },
  { pattern: /drone/i, category: "AMBIENT" },
  { pattern: /pad/i, category: "AMBIENT" },
  { pattern: /soundscape/i, category: "AMBIENT" },
  { pattern: /dream/i, category: "AMBIENT" },
  { pattern: /mystic/i, category: "AMBIENT" },
  { pattern: /ethereal/i, category: "AMBIENT" },
  { pattern: /fantasy/i, category: "AMBIENT" },
];

const ALLOWED_EXTENSIONS = [".ogg", ".wav", ".mp3"];

function findAudioFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findAudioFiles(fullPath));
    } else if (ALLOWED_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }
  return files;
}

function categorizeFile(filePath) {
  const basename = path.basename(filePath, path.extname(filePath));
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(basename)) {
      return rule.category;
    }
  }
  return "AMBIENT";
}

function nameFromFile(filePath) {
  const basename = path.basename(filePath, path.extname(filePath));
  return basename
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
}

function shouldLoop(category, filePath) {
  if (["AMBIENT", "DUNGEON", "WILDERNESS", "TAVERN", "TOWN"].includes(category)) {
    const basename = path.basename(filePath).toLowerCase();
    if (basename.includes("engine") || basename.includes("drone") ||
        basename.includes("space") || basename.includes("ambient") ||
        basename.includes("atmosphere") || basename.includes("noise") ||
        basename.includes("field")) {
      return true;
    }
  }
  return false;
}

function downloadPacks() {
  console.log("Downloading Kenney audio packs...");
  fs.mkdirSync(TMP_DIR, { recursive: true });

  for (const pack of KENNEY_PACKS) {
    const dest = path.join(TMP_DIR, pack.name + ".zip");
    console.log(`  ${pack.name}...`);
    execSync(`curl -sS -L -o "${dest}" "${pack.url}"`, { stdio: "inherit" });
  }

  console.log("Extracting...");
  for (const pack of KENNEY_PACKS) {
    const zipPath = path.join(TMP_DIR, pack.name + ".zip");
    execSync(`unzip -o "${zipPath}" -d "${TMP_DIR}" > /dev/null 2>&1`, { stdio: "inherit" });
  }
}

async function seed() {
  const existingCount = await prisma.soundtrack.count();
  if (existingCount > 0) {
    console.log(`Soundboard already has ${existingCount} tracks. Skipping seed.`);
    process.exit(0);
  }

  downloadPacks();

  const audioFiles = findAudioFiles(TMP_DIR);
  console.log(`Found ${audioFiles.length} audio files`);

  if (audioFiles.length === 0) {
    console.error("No audio files found. Exiting.");
    process.exit(1);
  }

  const categoryCounts = {};
  let imported = 0;

  for (const filePath of audioFiles) {
    const ext = path.extname(filePath).toLowerCase();
    const uniqueName = crypto.randomUUID() + ext;
    const destPath = path.join(AUDIO_DIR, uniqueName);

    fs.copyFileSync(filePath, destPath);

    const category = categorizeFile(filePath);
    const name = nameFromFile(filePath);
    const loop = shouldLoop(category, filePath);

    const relativePath = path.join("audio", uniqueName);

    try {
      await prisma.soundtrack.create({
        data: {
          name,
          category,
          filePath: relativePath,
          duration: 0,
          loop,
        },
      });

      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      imported++;

      if (imported % 50 === 0) {
        console.log(`  Imported ${imported}/${audioFiles.length}...`);
      }
    } catch (err) {
      console.error(`  Error importing ${name}: ${err.message}`);
    }
  }

  console.log(`\nDone! Imported ${imported} tracks.`);
  console.log("Category breakdown:");
  for (const [cat, count] of Object.entries(categoryCounts).sort()) {
    console.log(`  ${cat}: ${count}`);
  }

  console.log("\nCleaning up...");
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
}

seed()
  .then(() => {
    console.log("Seeding complete.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Fatal error:", err);
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    process.exit(1);
  });
