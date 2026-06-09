// =============================================================================
// Tablecast  Backup Archive Utility (Phase 6)
// Compresses the SQLite database and uploads directory into a timestamped zip.
// =============================================================================
"use strict";

const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const archiver = require("archiver");
const prisma = require("../prisma");
const logger = require("./logger");

const serverRoot = path.join(__dirname, "../..");
const backupsDir = path.join(serverRoot, "backups");
const CONFIG_PATH = path.resolve(serverRoot, "prisma/data/rclone.conf");

function ensureBackupsDir() {
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }
}

/**
 * Compresses the SQLite .db file and uploads/ directory.
 * @returns {Promise<{zipPath: string, zipName: string, size: number}>}
 */
function createBackupZip() {
  return new Promise((resolve, reject) => {
    try {
      ensureBackupsDir();

      // Generate timestamped filename
      const now = new Date();
      const timestamp = now.toISOString()
        .replace(/T/, "_")
        .replace(/:/g, "-")
        .split(".")[0]; // format: YYYY-MM-DD_HH-mm-ss
      const zipName = `tablecast_backup_${timestamp}.zip`;
      const zipPath = path.join(backupsDir, zipName);

      const output = fs.createWriteStream(zipPath);
      const archive = archiver("zip", {
        zlib: { level: 9 }, // Maximum compression
      });

      output.on("close", () => {
        logger.info("backup", "Archive created successfully", { zipName, size: archive.pointer() });
        // Apply retention policy: delete backups older than 30 days
        try { applyRetentionPolicy(); } catch (e) { logger.warn("backup", "Retention policy cleanup failed", { error: e.message }); }
        resolve({
          zipPath,
          zipName,
          size: archive.pointer(),
        });
      });

      archive.on("error", (err) => {
        logger.error("backup", "Archiver error", { error: err.message });
        reject(err);
      });

      archive.pipe(output);

      // 0. WAL checkpoint to ensure consistent state before copy
      prisma.$executeRawUnsafe("PRAGMA wal_checkpoint(FULL)").catch((err) => {
        logger.warn("backup", "WAL checkpoint failed (non-fatal)", { error: err.message });
      });

      // 1. Add SQLite Database file + WAL + SHM (if they exist)
      const dbUrl = process.env.DATABASE_URL || "file:./data/tablecast.db";
      let dbPath = "";
      
      if (dbUrl.startsWith("file:")) {
        const filePath = dbUrl.replace("file:", "");
        if (path.isAbsolute(filePath)) {
          dbPath = filePath;
        } else {
          // Prisma SQLite relative paths are resolved relative to the schema folder (prisma/)
          dbPath = path.resolve(serverRoot, "prisma", filePath);
        }
      } else {
        dbPath = path.resolve(serverRoot, "prisma/data/tablecast.db");
      }

      if (fs.existsSync(dbPath)) {
        logger.info("backup", "Adding SQLite database to archive", { dbPath });
        archive.file(dbPath, { name: "tablecast.db" });
        // Also include WAL and SHM files if they exist
        const walPath = dbPath + "-wal";
        const shmPath = dbPath + "-shm";
        if (fs.existsSync(walPath)) {
          archive.file(walPath, { name: "tablecast.db-wal" });
        }
        if (fs.existsSync(shmPath)) {
          archive.file(shmPath, { name: "tablecast.db-shm" });
        }
      } else {
        logger.warn("backup", "SQLite database not found", { dbPath });
      }

      // 2. Add Uploads Directory
      const uploadsDir = path.join(serverRoot, "uploads");
      if (fs.existsSync(uploadsDir)) {
        logger.info("backup", "Adding uploads directory to archive", { uploadsDir });
        archive.directory(uploadsDir, "uploads");
      } else {
        logger.warn("backup", "Uploads directory not found", { uploadsDir });
      }

      archive.finalize();
    } catch (err) {
      reject(err);
    }
  });
}

function execRclone(args) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const finalArgs = ["--config", CONFIG_PATH, ...args];
    execFile("rclone", finalArgs, { timeout: 300_000 }, (error, stdout = "", stderr = "") => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

async function writeRcloneConfigFile(content) {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  await fs.promises.writeFile(CONFIG_PATH, content || "", "utf8");
}

function parseIni(content) {
  const config = {};
  let currentSection = null;
  const lines = (content || "").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";")) {
      continue;
    }
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      currentSection = trimmed.substring(1, trimmed.length - 1);
      config[currentSection] = {};
    } else if (currentSection) {
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex !== -1) {
        const key = trimmed.substring(0, eqIndex).trim();
        const val = trimmed.substring(eqIndex + 1).trim();
        config[currentSection][key] = val;
      }
    }
  }
  return config;
}

function stringifyIni(config) {
  let content = "";
  for (const [section, sectionData] of Object.entries(config)) {
    content += `[${section}]\n`;
    for (const [key, val] of Object.entries(sectionData)) {
      content += `${key} = ${val}\n`;
    }
    content += "\n";
  }
  return content;
}

async function saveRcloneRemote(remoteName, type, options) {
  // Read existing config from DB
  let currentConfigContent = "";
  try {
    const setting = await prisma.appSetting.findUnique({
      where: { key: "rclone.config" },
    });
    currentConfigContent = setting?.value || "";
  } catch (err) {
    logger.warn("backup", "Could not read existing rclone config from DB", { error: err.message });
  }

  // Parse existing config
  const config = parseIni(currentConfigContent);

  // Set or update the target remote section
  config[remoteName] = {
    type,
    ...options
  };

  // Stringify the updated config
  const configContent = stringifyIni(config);

  // Ensure config directory exists and write file to disk
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  await fs.promises.writeFile(CONFIG_PATH, configContent, "utf8");

  // Save config Content back to database app_settings
  await prisma.appSetting.upsert({
    where: { key: "rclone.config" },
    update: { value: configContent },
    create: { key: "rclone.config", value: configContent },
  });

  return configContent;
}

async function initRcloneConfig() {
  try {
    const setting = await prisma.appSetting.findUnique({
      where: { key: "rclone.config" },
    });
    if (setting && setting.value) {
      await writeRcloneConfigFile(setting.value);
    } else {
      if (fs.existsSync(CONFIG_PATH)) {
        await fs.promises.unlink(CONFIG_PATH);
      }
    }
  } catch (err) {
    logger.error("backup", "Error loading rclone config from DB", { error: err.message });
  }
}

async function getRcloneStatus(remote = process.env.RCLONE_REMOTE || "gdrive:tablecast-backups") {
  try {
    await execRclone(["version"]);
  } catch (err) {
    return {
      installed: false,
      configured: false,
      remote,
      message: "rclone is not installed or is not available in PATH.",
      error: err.message,
    };
  }

  const configExists = fs.existsSync(CONFIG_PATH);
  if (!configExists) {
    return {
      installed: true,
      configured: false,
      remote,
      message: "rclone.conf is not configured in DM settings.",
    };
  }

  try {
    const { stdout } = await execRclone(["listremotes"]);
    const remoteNames = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const requestedRemoteName = String(remote || "").split(":")[0] + ":";
    const configured = remoteNames.includes(requestedRemoteName);

    return {
      installed: true,
      configured,
      remote,
      remotes: remoteNames,
      message: configured
        ? "rclone is installed and the selected remote is configured."
        : `rclone is installed, but remote ${requestedRemoteName} is not configured.`,
    };
  } catch (err) {
    return {
      installed: true,
      configured: false,
      remote,
      message: "rclone is installed, but its configuration could not be read.",
      error: err.stderr || err.message,
    };
  }
}

async function copyBackupToRemote(zipPath, remote) {
  return execRclone(["copy", zipPath, remote]);
}

function listLocalBackups(limit = 8) {
  ensureBackupsDir();
  return fs.readdirSync(backupsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".zip"))
    .map((entry) => {
      const filePath = path.join(backupsDir, entry.name);
      const stat = fs.statSync(filePath);
      return {
        name: entry.name,
        size: stat.size,
        createdAt: stat.birthtime.toISOString(),
        modifiedAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt))
    .slice(0, limit);
}

function deleteOldBackups(maxAgeDays = 30) {
  ensureBackupsDir();
  const now = Date.now();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  let deleted = 0;
  for (const entry of fs.readdirSync(backupsDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".zip")) {
      const filePath = path.join(backupsDir, entry.name);
      try {
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > maxAgeMs) {
          fs.unlinkSync(filePath);
          deleted++;
          logger.info("backup", "Deleted old backup", { name: entry.name, ageDays: Math.round((now - stat.mtimeMs) / 86400000) });
        }
      } catch (err) {
        logger.warn("backup", "Failed to delete old backup", { name: entry.name, error: err.message });
      }
    }
  }
  if (deleted > 0) {
    logger.info("backup", "Cleanup complete", { deleted });
  }
  return deleted;
}

// Retention: delete backups older than 30 days after each new backup
function applyRetentionPolicy() {
  return deleteOldBackups(30);
}

module.exports = {
  copyBackupToRemote,
  createBackupZip,
  getRcloneStatus,
  listLocalBackups,
  initRcloneConfig,
  writeRcloneConfigFile,
  saveRcloneRemote,
  deleteOldBackups,
  applyRetentionPolicy,
};
