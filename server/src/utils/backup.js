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
        console.log(`[Backup] Archive created successfully: ${zipName} (${archive.pointer()} bytes)`);
        resolve({
          zipPath,
          zipName,
          size: archive.pointer(),
        });
      });

      archive.on("error", (err) => {
        console.error("[Backup] Archiver error:", err);
        reject(err);
      });

      archive.pipe(output);

      // 1. Add SQLite Database file
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
        console.log(`[Backup] Adding SQLite database to archive from: ${dbPath}`);
        archive.file(dbPath, { name: "tablecast.db" });
      } else {
        console.warn(`[Backup] SQLite database not found at ${dbPath}`);
      }

      // 2. Add Uploads Directory
      const uploadsDir = path.join(serverRoot, "uploads");
      if (fs.existsSync(uploadsDir)) {
        console.log(`[Backup] Adding uploads directory to archive from: ${uploadsDir}`);
        archive.directory(uploadsDir, "uploads");
      } else {
        console.warn(`[Backup] Uploads directory not found at ${uploadsDir}`);
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
    execFile("rclone", finalArgs, { timeout: 120_000 }, (error, stdout = "", stderr = "") => {
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

async function saveRcloneRemote(remoteName, type, options) {
  const args = ["config", "create", remoteName, type];
  for (const [key, val] of Object.entries(options)) {
    args.push(`${key}=${val}`);
  }

  // Ensure config directory exists
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  await execRclone(args);

  // Read the modified CONFIG_PATH
  const configContent = await fs.promises.readFile(CONFIG_PATH, "utf8");

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
    console.error("[Backup] Error loading rclone config from DB:", err.message);
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

module.exports = {
  copyBackupToRemote,
  createBackupZip,
  getRcloneStatus,
  listLocalBackups,
  initRcloneConfig,
  writeRcloneConfigFile,
  saveRcloneRemote,
};
