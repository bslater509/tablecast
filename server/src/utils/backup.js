// =============================================================================
// Tablecast — Backup Archive Utility (Phase 6)
// Compresses the SQLite database and uploads directory into a timestamped zip.
// =============================================================================
"use strict";

const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

/**
 * Compresses the SQLite .db file and uploads/ directory.
 * @returns {Promise<{zipPath: string, zipName: string, size: number}>}
 */
function createBackupZip() {
  return new Promise((resolve, reject) => {
    try {
      const serverRoot = path.join(__dirname, "../..");
      const backupsDir = path.join(serverRoot, "backups");

      // Ensure the backups directory exists
      if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir, { recursive: true });
      }

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

module.exports = { createBackupZip };
