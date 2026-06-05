// =============================================================================
// Tablecast — Backup Router (Phase 6)
// Endpoints:  POST /api/backup  — triggers zip and rclone copy
// =============================================================================
"use strict";

const { Router } = require("express");
const { exec } = require("child_process");
const { createBackupZip } = require("../utils/backup");

const router = Router();

router.post("/", async (req, res) => {
  try {
    console.log("[Backup] Starting backup operation...");
    
    // 1. Generate local zip backup
    const zipInfo = await createBackupZip();

    // 2. Resolve target remote destination
    const remoteDest = req.body.remote || process.env.RCLONE_REMOTE || "gdrive:tablecast-backups";

    // 3. Build rclone command
    const command = `rclone copy "${zipInfo.zipPath}" "${remoteDest}"`;
    console.log(`[Backup] Running command: ${command}`);

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`[Backup] rclone execution failed:`, error.message);
        
        let customMessage = "Cloud upload failed.";
        const isNotInstalled = 
          error.message.includes("rclone: command not found") || 
          error.message.includes("rclone: not found") ||
          error.message.includes("not recognized as an internal") ||
          error.code === 127 ||
          error.code === "ENOENT";

        if (isNotInstalled) {
          customMessage = "rclone is not installed or not in the server's PATH. The local zip backup was created successfully.";
        } else {
          customMessage = "Local backup zip created, but rclone cloud synchronization failed (e.g. invalid config or remote).";
        }

        return res.status(200).json({
          success: false,
          message: customMessage,
          zipName: zipInfo.zipName,
          zipSize: zipInfo.size,
          remote: remoteDest,
          error: error.message,
          stdout: stdout || "",
          stderr: stderr || error.message
        });
      }

      console.log(`[Backup] rclone upload complete for: ${zipInfo.zipName}`);
      res.json({
        success: true,
        message: "Backup zip created and uploaded to cloud successfully.",
        zipName: zipInfo.zipName,
        zipSize: zipInfo.size,
        remote: remoteDest,
        stdout: stdout || "rclone: Copy operation successful.",
        stderr: stderr || ""
      });
    });
  } catch (err) {
    console.error("[Backup] Backup operation failed:", err.message);
    res.status(500).json({ error: "Backup operation failed: " + err.message });
  }
});

module.exports = router;
