// =============================================================================
// Tablecast  5etools Repositories Synchronization Manager
// Executes asynchronous git clones and pulls using shallow clones.
// =============================================================================
"use strict";

const { spawn, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Target directories (relative to server/src/utils/)
const srcPath = path.resolve(__dirname, "../../5etoolssrc");
const imgPath = path.resolve(__dirname, "../../5etoolsimg");
const rootPath = path.resolve(__dirname, "../..");

// Repository URL variables (defaulting to mirror endpoints)
const srcUrl = process.env.FIVE_E_TOOLS_SRC_URL || "https://github.com/5etools-mirror-3/5etools-src.git";
const imgUrl = process.env.FIVE_E_TOOLS_IMG_URL || "https://github.com/5etools-mirror-3/5etools-img.git";

// In-memory sync state
let syncState = {
  isSyncing: false,
  status: "idle", // "idle", "syncing", "success", "error"
  progress: "Idle",
  logs: [],
};

/**
 * Log message helper.
 */
function log(message, type = "info") {
  const timestamp = new Date().toLocaleTimeString();
  const logLine = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
  console.log(`[ReferenceSync] ${logLine}`);
  syncState.logs.push(logLine);
  if (syncState.logs.length > 500) {
    syncState.logs.shift(); // keep log buffer manageable
  }
}

/**
 * Executes a terminal command asynchronously, logging output line-by-line.
 */
function execCmd(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const finalArgs = cmd === "git" ? ["-c", "safe.directory=*", ...args] : args;
    log(`Executing: ${cmd} ${finalArgs.join(" ")} (Cwd: ${cwd})`, "info");
    
    // Set environment variable to skip prompts and avoid blocking
    const env = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
    const child = spawn(cmd, finalArgs, { cwd, env });

    child.stdout.on("data", (data) => {
      const lines = data.toString().split(/\r?\n/);
      lines.forEach((line) => {
        if (line.trim()) log(line, "stdout");
      });
    });

    child.stderr.on("data", (data) => {
      const lines = data.toString().split(/\r?\n/);
      lines.forEach((line) => {
        if (line.trim()) log(line, "stderr");
      });
    });

    child.on("close", (code) => {
      if (code === 0) {
        log(`Command completed successfully.`, "info");
        resolve();
      } else {
        log(`Command failed with exit code ${code}.`, "error");
        reject(new Error(`Exit code ${code}`));
      }
    });

    child.on("error", (err) => {
      log(`Process execution error: ${err.message}`, "error");
      reject(err);
    });
  });
}

/**
 * Checks if a directory contains a valid Git repository with at least one commit.
 */
function isGitRepoValid(repoPath) {
  if (!fs.existsSync(repoPath) || !fs.existsSync(path.join(repoPath, ".git"))) {
    return false;
  }
  try {
    execSync("git -c safe.directory=* rev-parse HEAD", { cwd: repoPath, stdio: "ignore" });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Returns current sync status and folder existences.
 */
function getStatus() {
  const srcExists = isGitRepoValid(srcPath);
  const imgExists = isGitRepoValid(imgPath);
  const syncOnStartup = process.env.REFERENCE_SYNC_ON_STARTUP === "true";
  
  return {
    ...syncState,
    srcExists,
    imgExists,
    srcUrl,
    imgUrl,
    syncOnStartup,
  };
}

/**
 * Orchestrates cloning/pulling repositories in the background.
 */
async function sync() {
  if (syncState.isSyncing) {
    log("Sync already in progress. Ignoring request.", "warn");
    return;
  }

  syncState.isSyncing = true;
  syncState.status = "syncing";
  syncState.logs = [];

  try {
    // 1. Sync 5etoolssrc (Data Repo)
    const srcExists = isGitRepoValid(srcPath);
    if (!srcExists) {
      syncState.progress = "Cloning 5etoolssrc (Shallow Clone)...";
      log(`Cloning 5etoolssrc from ${srcUrl} to ${srcPath}`, "info");
      
      // Clean up contents inside the volume (avoid deleting the mount point itself)
      if (fs.existsSync(srcPath)) {
        try {
          const files = fs.readdirSync(srcPath);
          for (const file of files) {
            fs.rmSync(path.join(srcPath, file), { recursive: true, force: true });
          }
        } catch (e) {
          log(`Cleaning srcPath failed: ${e.message}`, "warn");
        }
      } else {
        fs.mkdirSync(srcPath, { recursive: true });
      }
      
      await execCmd("git", ["clone", "--depth", "1", "--progress", srcUrl, "."], srcPath);
    } else {
      syncState.progress = "Pulling updates for 5etoolssrc...";
      log(`Updating 5etoolssrc repository at ${srcPath}`, "info");
      await execCmd("git", ["pull", "--progress"], srcPath);
    }

    // 2. Sync 5etoolsimg (Images Repo)
    const imgExists = isGitRepoValid(imgPath);
    if (!imgExists) {
      syncState.progress = "Cloning 5etoolsimg (Shallow Clone, this might take a moment)...";
      log(`Cloning 5etoolsimg from ${imgUrl} to ${imgPath}`, "info");
      
      // Clean up contents inside the volume
      if (fs.existsSync(imgPath)) {
        try {
          const files = fs.readdirSync(imgPath);
          for (const file of files) {
            fs.rmSync(path.join(imgPath, file), { recursive: true, force: true });
          }
        } catch (e) {
          log(`Cleaning imgPath failed: ${e.message}`, "warn");
        }
      } else {
        fs.mkdirSync(imgPath, { recursive: true });
      }
      
      await execCmd("git", ["clone", "--depth", "1", "--progress", imgUrl, "."], imgPath);
    } else {
      syncState.progress = "Pulling updates for 5etoolsimg...";
      log(`Updating 5etoolsimg repository at ${imgPath}`, "info");
      await execCmd("git", ["pull", "--progress"], imgPath);
    }

    syncState.progress = "Sync completed successfully!";
    syncState.status = "success";
    log("References sync finished successfully.", "info");
  } catch (err) {
    syncState.progress = `Sync failed: ${err.message}`;
    syncState.status = "error";
    log(`References sync failed: ${err.message}`, "error");
  } finally {
    syncState.isSyncing = false;
  }
}

module.exports = {
  getStatus,
  sync,
};
