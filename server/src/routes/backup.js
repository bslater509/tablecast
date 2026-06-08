// =============================================================================
// Tablecast  Backup Router (Phase 6)
// Endpoints:  POST /api/backup   triggers zip and rclone copy
// =============================================================================
"use strict";

const { Router } = require("express");
const crypto = require("crypto");
const {
  copyBackupToRemote,
  createBackupZip,
  getRcloneStatus,
  listLocalBackups,
  saveRcloneRemote,
  writeRcloneConfigFile,
} = require("../utils/backup");
const {
  requireDm,
} = require("../auth");
const prisma = require("../prisma");

const router = Router();
const oauthStates = new Map();
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

function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return str.replace(/[&<>"']/g, (m) => {
    switch (m) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
    }
  });
}

function escapeJsStr(str) {
  if (typeof str !== "string") return "";
  return str.replace(/['\\\n\r<\/]/g, (m) => {
    switch (m) {
      case "'": return "\\'";
      case "\\": return "\\\\";
      case "\n": return "\\n";
      case "\r": return "\\r";
      case "<": return "\\u003C";
      case "/": return "\\u002F";
    }
  });
}

router.post("/oauth-init", requireDm, async (req, res) => {
  try {
    const { client_id, client_secret, remote_name, remote_path, redirect_uri } = req.body;
    if (!client_id || !client_secret || !remote_name || !redirect_uri) {
      return res.status(400).json({ error: "Missing required parameters for OAuth initialization." });
    }

    // Clean up expired states to prevent memory leaks
    const now = Date.now();
    for (const [s, info] of oauthStates.entries()) {
      if (now - info.createdAt > 15 * 60 * 1000) {
        oauthStates.delete(s);
      }
    }

    let clientOrigin = req.get("origin");
    if (!clientOrigin) {
      const referer = req.get("referer");
      if (referer) {
        try {
          clientOrigin = new URL(referer).origin;
        } catch {
          console.warn("[Backup] Failed to parse referer URL:", referer);
        }
      }
    }
    if (!clientOrigin) {
      clientOrigin = "*";
    }

    const state = crypto.randomBytes(16).toString("hex");
    oauthStates.set(state, {
      client_id,
      client_secret,
      remote_name,
      remote_path: remote_path || "",
      redirect_uri,
      clientOrigin,
      createdAt: now
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + new URLSearchParams({
      client_id,
      redirect_uri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/drive",
      access_type: "offline",
      prompt: "consent",
      state
    }).toString();

    res.json({ authUrl });
  } catch (err) {
    console.error("[Backup OAuth Init] Failed:", err.message);
    res.status(500).json({ error: "Failed to initialize Google Drive OAuth flow." });
  }
});

router.get("/oauth-callback", async (req, res) => {
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    return res.status(400).send(`OAuth Error from Google: ${escapeHtml(String(oauthError))}`);
  }

  if (!code || !state) {
    return res.status(400).send("Missing authorization code or state parameter.");
  }

  const stateInfo = oauthStates.get(state);
  if (!stateInfo) {
    return res.status(400).send("Invalid or expired OAuth session state. Please restart authorization.");
  }

  // Delete state to prevent replay
  oauthStates.delete(state);

  if (Date.now() - stateInfo.createdAt > 10 * 60 * 1000) {
    return res.status(400).send("OAuth session has expired (max 10 minutes). Please try again.");
  }

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: stateInfo.client_id,
        client_secret: stateInfo.client_secret,
        redirect_uri: stateInfo.redirect_uri,
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Google token exchange failed: ${errText}`);
    }

    const tokenData = await response.json();
    const expiryDate = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString();
    
    const rcloneToken = JSON.stringify({
      access_token: tokenData.access_token,
      token_type: tokenData.token_type || "Bearer",
      refresh_token: tokenData.refresh_token,
      expiry: expiryDate,
    });

    // Save configuration using rclone config create via utility
    await saveRcloneRemote(stateInfo.remote_name, "drive", {
      client_id: stateInfo.client_id,
      client_secret: stateInfo.client_secret,
      scope: "drive",
      token: rcloneToken,
    });

    const fullRemote = `${stateInfo.remote_name}:${stateInfo.remote_path}`;
    await prisma.appSetting.upsert({
      where: { key: "rclone.remote" },
      update: { value: fullRemote },
      create: { key: "rclone.remote", value: fullRemote },
    });

    const targetOrigin = stateInfo.clientOrigin || "*";

    res.setHeader("Content-Type", "text/html");
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Google Drive Authentication Successful</title>
        <style>
          body {
            background-color: #0f0e17;
            color: #fffffe;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            text-align: center;
          }
          .card {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(200, 151, 58, 0.35);
            box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);
            border-radius: 12px;
            padding: 2.5rem;
            max-width: 420px;
          }
          h1 { color: #c8973a; margin-top: 0; font-size: 1.8rem; }
          p { color: #a7a9be; line-height: 1.6; font-size: 0.95rem; }
          .success-icon { font-size: 4rem; margin-bottom: 1.5rem; animation: bounce 1s infinite alternate; }
          @keyframes bounce {
            from { transform: translateY(0); }
            to { transform: translateY(-10px); }
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="success-icon">✨</div>
          <h1>Authentication Complete</h1>
          <p>Tablecast has successfully configured your Google Drive backup remote <strong>"${escapeHtml(stateInfo.remote_name)}"</strong>!</p>
          <p>This window will close automatically shortly.</p>
        </div>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'RCLONE_AUTH_SUCCESS' }, '${escapeJsStr(targetOrigin)}');
          }
          setTimeout(() => {
            window.close();
          }, 3000);
        </script>
      </body>
      </html>
    `);
  } catch (err) {
    console.error("[Backup OAuth Callback] Error:", err.message);
    res.setHeader("Content-Type", "text/html");
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Google Drive Authentication Failed</title>
        <style>
          body {
            background-color: #0f0e17;
            color: #fffffe;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            text-align: center;
          }
          .card {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(235, 87, 87, 0.35);
            box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);
            border-radius: 12px;
            padding: 2.5rem;
            max-width: 420px;
          }
          h1 { color: #eb5757; margin-top: 0; font-size: 1.8rem; }
          p { color: #a7a9be; line-height: 1.6; font-size: 0.95rem; }
          .error-icon { font-size: 4rem; margin-bottom: 1.5rem; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="error-icon">❌</div>
          <h1>Authentication Failed</h1>
          <p>An error occurred while linking your Google Drive:</p>
          <pre style="background: rgba(0,0,0,0.4); padding: 1rem; border-radius: 6px; text-align: left; overflow-x: auto; font-size: 0.8rem; color: #ff8585;">${escapeHtml(err.message)}</pre>
          <p>Please close this window and try again.</p>
        </div>
      </body>
      </html>
    `);
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
      error: "Backup operation failed. Check server logs for details.",
    });
  } finally {
    backupInProgress = false;
  }
});

module.exports = router;
