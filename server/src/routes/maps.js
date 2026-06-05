// =============================================================================
// Tablecast — Maps & Tokens CRUD Routes
// Endpoints:  GET /api/maps
//             GET /api/maps/:id
//             POST /api/maps            (supports Base64 imageData upload)
//             DELETE /api/maps/:id
//             POST /api/maps/:id/tokens
//             PUT /api/tokens/:id
//             DELETE /api/tokens/:id
// =============================================================================
"use strict";

const { Router } = require("express");
const fs = require("fs");
const path = require("path");
const prisma = require("../prisma");

const router = Router();

// Ensure the uploads directory exists on host/container
const UPLOADS_DIR = path.join(__dirname, "../../uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// GET /api/maps — List all maps
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const maps = await prisma.map.findMany({
      orderBy: { createdAt: "asc" },
    });
    res.json(maps);
  } catch (err) {
    console.error("[API] GET /api/maps error:", err.message);
    res.status(500).json({ error: "Failed to fetch maps." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/maps/:id — Fetch single map with tokens
// ---------------------------------------------------------------------------
router.get("/:id", async (req, res) => {
  try {
    const map = await prisma.map.findUnique({
      where: { id: Number(req.params.id) },
      include: { tokens: true },
    });

    if (!map) {
      return res.status(404).json({ error: "Map not found." });
    }

    res.json(map);
  } catch (err) {
    console.error("[API] GET /api/maps/:id error:", err.message);
    res.status(500).json({ error: "Failed to fetch map." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/maps — Create a map (and write Base64 image to uploads)
// Body: { name, gridSize, gridType, imageData }
// ---------------------------------------------------------------------------
router.post("/", async (req, res) => {
  try {
    const { name, gridSize, gridType, imageData } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Map name is required." });
    }

    let imageUrl = "/uploads/placeholder_map.png";

    if (imageData && typeof imageData === "string" && imageData.startsWith("data:")) {
      const matches = imageData.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const mimeType = matches[1];
        const base64Data = matches[2];
        const dataBuffer = Buffer.from(base64Data, "base64");

        // Determine extension
        let ext = "png";
        if (mimeType.includes("jpeg") || mimeType.includes("jpg")) ext = "jpg";
        else if (mimeType.includes("webp")) ext = "webp";
        else if (mimeType.includes("gif")) ext = "gif";

        const filename = `map_${Date.now()}.${ext}`;
        const filePath = path.join(UPLOADS_DIR, filename);

        // Write the decoded buffer to file
        fs.writeFileSync(filePath, dataBuffer);
        imageUrl = `/uploads/${filename}`;
        console.log(`[API] Saved uploaded map image to ${filePath}`);
      } else {
        return res.status(400).json({ error: "Invalid base64 image data format." });
      }
    }

    const newMap = await prisma.map.create({
      data: {
        name: name.trim(),
        gridSize: gridSize ? Number(gridSize) : 50,
        gridType: gridType || "SQUARE",
        imageUrl,
        fogState: "[]",
      },
    });

    res.status(201).json(newMap);
  } catch (err) {
    console.error("[API] POST /api/maps error:", err.message);
    res.status(500).json({ error: "Failed to create map." });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/maps/:id — Delete a map
// ---------------------------------------------------------------------------
router.delete("/:id", async (req, res) => {
  try {
    const mapId = Number(req.params.id);

    // Find first to delete actual image from filesystem if it exists
    const map = await prisma.map.findUnique({ where: { id: mapId } });
    if (!map) {
      return res.status(404).json({ error: "Map not found." });
    }

    // Attempt to delete physical file if it's not a generic placeholder
    if (map.imageUrl && map.imageUrl.startsWith("/uploads/map_")) {
      const filename = path.basename(map.imageUrl);
      const filePath = path.join(UPLOADS_DIR, filename);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          console.log(`[API] Deleted map image file: ${filePath}`);
        } catch (fileErr) {
          console.error(`[API] Could not delete image file ${filePath}:`, fileErr.message);
        }
      }
    }

    await prisma.map.delete({ where: { id: mapId } });
    res.json({ message: "Map deleted successfully." });
  } catch (err) {
    console.error("[API] DELETE /api/maps/:id error:", err.message);
    res.status(500).json({ error: "Failed to delete map." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/maps/:id/tokens — Add a token to a map
// Body: { characterId, label, imageUrl, x, y }
// ---------------------------------------------------------------------------
router.post("/:id/tokens", async (req, res) => {
  try {
    const mapId = Number(req.params.id);
    const { characterId, label, imageUrl, x, y } = req.body;

    // Check map exists
    const mapExists = await prisma.map.findUnique({ where: { id: mapId } });
    if (!mapExists) {
      return res.status(404).json({ error: "Map not found." });
    }

    const data = {
      mapId,
      label: label || "",
      imageUrl: imageUrl || "",
      x: x !== undefined ? Number(x) : 0,
      y: y !== undefined ? Number(y) : 0,
    };

    if (characterId) {
      data.characterId = Number(characterId);
    }

    const token = await prisma.token.create({
      data,
      include: { character: true },
    });

    res.status(201).json(token);
  } catch (err) {
    console.error("[API] POST /api/maps/:id/tokens error:", err.message);
    res.status(500).json({ error: "Failed to create token." });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/tokens/:id — Update token (label, imageUrl, characterId, x, y)
// ---------------------------------------------------------------------------
router.put("/tokens/:id", async (req, res) => {
  try {
    const tokenId = Number(req.params.id);
    const { characterId, label, imageUrl, x, y } = req.body;

    const data = {};
    if (label !== undefined) data.label = label;
    if (imageUrl !== undefined) data.imageUrl = imageUrl;
    if (x !== undefined) data.x = Number(x);
    if (y !== undefined) data.y = Number(y);
    if (characterId !== undefined) data.characterId = characterId ? Number(characterId) : null;

    const updatedToken = await prisma.token.update({
      where: { id: tokenId },
      data,
      include: { character: true },
    });

    res.json(updatedToken);
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Token not found." });
    }
    console.error("[API] PUT /api/tokens/:id error:", err.message);
    res.status(500).json({ error: "Failed to update token." });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/tokens/:id — Delete token
// ---------------------------------------------------------------------------
router.delete("/tokens/:id", async (req, res) => {
  try {
    const tokenId = Number(req.params.id);
    await prisma.token.delete({ where: { id: tokenId } });
    res.json({ message: "Token deleted successfully." });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Token not found." });
    }
    console.error("[API] DELETE /api/tokens/:id error:", err.message);
    res.status(500).json({ error: "Failed to delete token." });
  }
});

module.exports = router;
