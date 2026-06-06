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
const prisma = require("../prisma");

const router = Router();
let backupInProgress = false;

async function resolveRemote(req) {
  const bodyRemote = req.body?.remote || req.query?.remote;
  if (bodyRemote) return bodyRemote;

  const setting = await prisma.appSetting.findUnique({
    where: { key: "rclone.remote" }
  });
  if (setting && setting.value) return setting.value;

  return process.env.RCLONE_REMOTE || "gdrive:tablecast-backups";
}

router.get("/config", requireDm, async (req, res) => {
  try {
    const configSetting = await prisma.appSetting.findUnique({
      where: { key: "rclone.config" }
    });
    const remoteSetting = await prisma.appSetting.findUnique({
      where: { key: "rclone.remote" }
    });

    res.json({
      config: configSetting?.value || "",
      remote: remoteSetting?.value || process.env.RCLONE_REMOTE || "gdrive:tablecast-backups"
    });
  } catch (err) {
    console.error("[Backup Config] Fetch failed:", err.message);
    res.status(500).json({ error: "Failed to load backup configuration." });
  }
});

router.put("/config", requireDm, async (req, res) => {
  try {
    const { config, remote } = req.body;
    const { writeRcloneConfigFile } = require("../utils/backup");

    if (config !== undefined) {
      await prisma.appSetting.upsert({
        where: { key: "rclone.config" },
        update: { value: config },
        create: { key: "rclone.config", value: config }
      });
      await writeRcloneConfigFile(config);
    }

    if (remote !== undefined) {
      await prisma.appSetting.upsert({
        where: { key: "rclone.remote" },
        update: { value: remote },
        create: { key: "rclone.remote", value: remote }
      });
    }

    res.json({ success: true, message: "Backup configuration updated successfully." });
  } catch (err) {
    console.error("[Backup Config] Save failed:", err.message);
    res.status(500).json({ error: "Failed to update backup configuration." });
  }
});

router.get("/status", requireDm, async (req, res) => {
  try {
    const remote = await resolveRemote(req);
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
    const remoteDest = await resolveRemote(req);
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
