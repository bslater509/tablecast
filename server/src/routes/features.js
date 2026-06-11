// =============================================================================
// Tablecast — Feature Roadmap Route
// Serves the features.md file content for display in DM settings.
// =============================================================================
"use strict";

const { Router } = require("express");
const fs = require("fs");
const path = require("path");
const { requireDm } = require("../auth");

const router = Router();

const FEATURES_PATH = path.join(__dirname, "../../../features.md");
// Fallback: in Docker the file is at /app/features.md
const FEATURES_PATH_DOCKER = "/app/features.md";
const resolvedPath = fs.existsSync(FEATURES_PATH_DOCKER) ? FEATURES_PATH_DOCKER : FEATURES_PATH;

router.get("/", requireDm, (req, res) => {
  try {
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: "features.md not found" });
    }
    const content = fs.readFileSync(resolvedPath, "utf-8");
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
