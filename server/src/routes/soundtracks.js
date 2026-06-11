// =============================================================================
// Tablecast  Soundboard Audio Track Routes
// Endpoints:  GET    /api/soundtracks
//             GET    /api/soundtracks/:id
//             POST   /api/soundtracks           (multipart: audio file + fields)
//             PUT    /api/soundtracks/:id
//             DELETE /api/soundtracks/:id
// =============================================================================
"use strict";

const { Router } = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const prisma = require("../prisma");
const { requireDm } = require("../auth");
const logger = require("../utils/logger");

const router = Router();

// Ensure the audio uploads directory exists
const AUDIO_DIR = path.join(__dirname, "../../uploads/audio");
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// Multer config — audio file uploads
// ---------------------------------------------------------------------------
const ALLOWED_MIMES = ["audio/mpeg", "audio/ogg", "audio/wav", "audio/wave", "audio/x-wav"];
const ALLOWED_EXTENSIONS = [".mp3", ".ogg", ".wav"];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, AUDIO_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = crypto.randomUUID() + ext;
    cb(null, uniqueName);
  },
});

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_EXTENSIONS.includes(ext) || ALLOWED_MIMES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${ext}. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

// ---------------------------------------------------------------------------
// GET /api/soundtracks  List all tracks
// ---------------------------------------------------------------------------
router.get("/", requireDm, async (req, res) => {
  try {
    const where = {};
    if (req.query.category) {
      where.category = req.query.category;
    }
    const tracks = await prisma.soundtrack.findMany({
      where,
      orderBy: { createdAt: "asc" },
    });
    res.json(tracks);
  } catch (err) {
    logger.error("api:soundtracks", "Error listing tracks", { error: err.message });
    res.status(500).json({ error: "Failed to fetch soundtracks." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/soundtracks/:id  Get single track
// ---------------------------------------------------------------------------
router.get("/:id", requireDm, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }
    const track = await prisma.soundtrack.findUnique({ where: { id } });
    if (!track) {
      return res.status(404).json({ error: "Soundtrack not found." });
    }
    res.json(track);
  } catch (err) {
    logger.error("api:soundtracks", "Error fetching track", { error: err.message });
    res.status(500).json({ error: "Failed to fetch soundtrack." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/soundtracks  Upload audio + create DB record
// ---------------------------------------------------------------------------
router.post("/", requireDm, (req, res) => {
  upload.single("audio")(req, res, async (uploadErr) => {
    if (uploadErr) {
      logger.error("api:soundtracks", "Upload error", { error: uploadErr.message });
      if (uploadErr.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "File too large. Maximum 50MB." });
      }
      return res.status(400).json({ error: uploadErr.message });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ error: "No audio file provided. Use field name 'audio'." });
      }

      const name = req.body.name || req.file.originalname.replace(/\.[^/.]+$/, "");
      const category = req.body.category || "AMBIENT";
      const loop = req.body.loop === "true" || req.body.loop === true;

      const relativePath = path.join("audio", req.file.filename);

      const track = await prisma.soundtrack.create({
        data: {
          name,
          category,
          filePath: relativePath,
          duration: 0, // Could be computed server-side with ffprobe
          loop,
        },
      });

      logger.info("api:soundtracks", "Track uploaded", { id: track.id, name: track.name });
      res.status(201).json(track);
    } catch (err) {
      logger.error("api:soundtracks", "Error saving track", { error: err.message });
      res.status(500).json({ error: "Failed to save soundtrack." });
    }
  });
});

// ---------------------------------------------------------------------------
// PUT /api/soundtracks/:id  Update track metadata
// ---------------------------------------------------------------------------
router.put("/:id", requireDm, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    const existing = await prisma.soundtrack.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Soundtrack not found." });
    }

    const data = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.category !== undefined) data.category = req.body.category;
    if (req.body.duration !== undefined) data.duration = Number(req.body.duration);
    if (req.body.loop !== undefined) data.loop = req.body.loop === "true" || req.body.loop === true;

    const track = await prisma.soundtrack.update({ where: { id }, data });
    res.json(track);
  } catch (err) {
    logger.error("api:soundtracks", "Error updating track", { error: err.message });
    res.status(500).json({ error: "Failed to update soundtrack." });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/soundtracks/:id  Delete track + file
// ---------------------------------------------------------------------------
router.delete("/:id", requireDm, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    const track = await prisma.soundtrack.findUnique({ where: { id } });
    if (!track) {
      return res.status(404).json({ error: "Soundtrack not found." });
    }

    // Delete the file from disk
    const filePath = path.join(__dirname, "../../uploads", track.filePath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await prisma.soundtrack.delete({ where: { id } });
    logger.info("api:soundtracks", "Track deleted", { id, name: track.name });
    res.json({ ok: true });
  } catch (err) {
    logger.error("api:soundtracks", "Error deleting track", { error: err.message });
    res.status(500).json({ error: "Failed to delete soundtrack." });
  }
});

module.exports = router;
