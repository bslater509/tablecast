// =============================================================================
// Tablecast  Backup Router (Phase 6)
// Endpoints:  POST /api/backup   triggers zip and rclone copy
// =============================================================================
"use strict";

const { Router } = require("express");
const {
  copyBackupToRemote,
  createBackupZip,
  getRcloneStatus,
  listLocalBackups,
} = require("../utils/backup");
const { requireDm } = require("../auth");

const router = Router();
let backupInProgress = false;

function resolveRemote(req) {
  return req.body?.remote || req.query?.remote || process.env.RCLONE_REMOTE || "gdrive:tablecast-backups";
}

router.get("/status", requireDm, async (req, res) => {
  try {
    const remote = resolveRemote(req);
    const rclone = await getRcloneStatus(remote);
    res.json({
      inProgress: backupInProgress,
      rclone,
      history: listLocalBackups(),
    });
  } catch (err) {
    console.error("[Backup] Status check failed:", err.message);
    res.status(500).json({ error: "Failed to retrieve backup status." });
  }
});

router.post("/", requireDm, async (req, res) => {
  if (backupInProgress) {
    return res.status(409).json({
      success: false,
      message: "A backup is already running. Please wait for it to finish before starting another.",
      inProgress: true,
    });
  }

  backupInProgress = true;

  try {
    console.log("[Backup] Starting backup operation...");

    // 1. Generate local zip backup
    const zipInfo = await createBackupZip();

    // 2. Resolve target remote destination
    const remoteDest = resolveRemote(req);
    const rclone = await getRcloneStatus(remoteDest);

    if (!rclone.installed || !rclone.configured) {
      return res.status(200).json({
        success: false,
        localOnly: true,
        message: `Local backup zip created, but cloud sync was skipped. ${rclone.message}`,
        zipName: zipInfo.zipName,
        zipSize: zipInfo.size,
        remote: remoteDest,
        rclone,
        history: listLocalBackups(),
        stdout: "",
        stderr: rclone.error || rclone.message,
      });
    }

    console.log(`[Backup] Uploading ${zipInfo.zipName} to ${remoteDest}`);
    const { stdout, stderr } = await copyBackupToRemote(zipInfo.zipPath, remoteDest);

    console.log(`[Backup] rclone upload complete for: ${zipInfo.zipName}`);
    res.json({
      success: true,
      message: "Backup zip created and uploaded to cloud successfully.",
      zipName: zipInfo.zipName,
      zipSize: zipInfo.size,
      remote: remoteDest,
      rclone,
      history: listLocalBackups(),
      stdout: stdout || "rclone: Copy operation successful.",
      stderr: stderr || "",
    });
  } catch (err) {
    console.error("[Backup] Backup operation failed:", err.message);
    res.status(500).json({
      error: "Backup operation failed: " + err.message,
      stdout: err.stdout || "",
      stderr: err.stderr || err.message,
      history: listLocalBackups(),
    });
  } finally {
    backupInProgress = false;
  }
});

module.exports = router;
