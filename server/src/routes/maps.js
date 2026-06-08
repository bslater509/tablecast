// =============================================================================
// Tablecast  Maps & Tokens CRUD Routes
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
const { requireDm } = require("../auth");

const router = Router();

// Ensure the uploads directory exists on host/container
const UPLOADS_DIR = path.join(__dirname, "../../uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// GET /api/maps  List all maps
// ---------------------------------------------------------------------------
router.get("/", requireDm, async (req, res) => {
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
// GET /api/maps/:id  Fetch single map with tokens
// ---------------------------------------------------------------------------
router.get("/:id", requireDm, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    const map = await prisma.map.findUnique({
      where: { id },
      include: { tokens: { include: { character: true, npc: true, monster: true } } },
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
// POST /api/maps  Create a map (and write Base64 image to uploads)
// Body: { name, gridSize, gridType, imageData, imageUrl }
// ---------------------------------------------------------------------------
router.post("/", requireDm, async (req, res) => {
  try {
    const { name, gridSize, gridType, imageData, imageUrl } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Map name is required." });
    }

    let resolvedImageUrl = "/uploads/placeholder_map.png";

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

        const filename = `map_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const filePath = path.join(UPLOADS_DIR, filename);

        // Write the decoded buffer to file
        await fs.promises.writeFile(filePath, dataBuffer);
        resolvedImageUrl = `/uploads/${filename}`;
        console.log(`[API] Saved uploaded map image to ${filePath}`);
      } else {
        return res.status(400).json({ error: "Invalid base64 image data format." });
      }
    } else if (imageUrl && typeof imageUrl === "string") {
      const trimmedImageUrl = imageUrl.trim();
      const isAllowedLocalPath = trimmedImageUrl.startsWith("/uploads/") || trimmedImageUrl.startsWith("/5etoolsimg/");
      const isAllowedRemotePath = /^https?:\/\/\S+$/i.test(trimmedImageUrl);

      if (!isAllowedLocalPath && !isAllowedRemotePath) {
        return res.status(400).json({ error: "Image URL must be an uploads path, 5etools image path, or http(s) URL." });
      }

      resolvedImageUrl = trimmedImageUrl;
    }

    const newMap = await prisma.map.create({
      data: {
        name: name.trim(),
        gridSize: gridSize ? Number(gridSize) : 50,
        gridType: gridType || "SQUARE",
        imageUrl: resolvedImageUrl,
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
// DELETE /api/maps/:id  Delete a map
// ---------------------------------------------------------------------------
router.delete("/:id", requireDm, async (req, res) => {
  try {
    const mapId = Number(req.params.id);
    if (isNaN(mapId) || mapId <= 0) {
      return res.status(400).json({ error: "Invalid map id." });
    }

    // Find first to delete actual image from filesystem if it exists
    const map = await prisma.map.findUnique({ where: { id: mapId } });
    if (!map) {
      return res.status(404).json({ error: "Map not found." });
    }

    // Attempt to delete physical file if it's not a generic placeholder
    if (map.imageUrl && map.imageUrl.startsWith("/uploads/map_")) {
      const filename = path.basename(map.imageUrl);
      const filePath = path.join(UPLOADS_DIR, filename);
      try {
        await fs.promises.unlink(filePath);
        console.log(`[API] Deleted map image file: ${filePath}`);
      } catch (fileErr) {
        if (fileErr.code !== "ENOENT") {
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
// POST /api/maps/:id/tokens  Add a token to a map
// Body: { characterId, label, imageUrl, x, y }
// ---------------------------------------------------------------------------
router.post("/:id/tokens", requireDm, async (req, res) => {
  try {
    const mapId = Number(req.params.id);
    const { characterId, npcId, monsterId, label, imageUrl, x, y, stats } = req.body;
    const tokenX = x !== undefined ? Number(x) : 0;
    const tokenY = y !== undefined ? Number(y) : 0;

    if (isNaN(mapId) || mapId <= 0) {
      return res.status(400).json({ error: "Invalid map id." });
    }

    if (!Number.isFinite(tokenX) || !Number.isFinite(tokenY) || tokenX < 0 || tokenY < 0 || tokenX > 10000 || tokenY > 10000) {
      return res.status(400).json({ error: "Token coordinates must be valid numbers between 0 and 10000." });
    }

    const data = {
      mapId,
      label: label || "",
      imageUrl: imageUrl || "",
      x: tokenX,
      y: tokenY,
      stats: stats || null,
    };

    if (characterId) {
      data.characterId = Number(characterId);
    }
    if (npcId) {
      data.npcId = Number(npcId);
    }
    if (monsterId) {
      data.monsterId = Number(monsterId);
    }

    const token = await prisma.token.create({
      data,
      include: { character: true, npc: true, monster: true },
    });

    res.status(201).json(token);
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Map not found." });
    }
    console.error("[API] POST /api/maps/:id/tokens error:", err.message);
    res.status(500).json({ error: "Failed to create token." });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/tokens/:id  Update token (label, imageUrl, characterId, x, y)
// ---------------------------------------------------------------------------
router.put("/tokens/:id", requireDm, async (req, res) => {
  try {
    const tokenId = Number(req.params.id);
    const { characterId, npcId, monsterId, label, imageUrl, x, y, stats } = req.body;
    if (isNaN(tokenId) || tokenId <= 0) {
      return res.status(400).json({ error: "Invalid token id." });
    }

    const data = {};
    if (label !== undefined) data.label = label;
    if (imageUrl !== undefined) data.imageUrl = imageUrl;
    if (x !== undefined) {
      const nextX = Number(x);
      if (!Number.isFinite(nextX) || nextX < 0 || nextX > 10000) {
        return res.status(400).json({ error: "Token x coordinate must be between 0 and 10000." });
      }
      data.x = nextX;
    }
    if (y !== undefined) {
      const nextY = Number(y);
      if (!Number.isFinite(nextY) || nextY < 0 || nextY > 10000) {
        return res.status(400).json({ error: "Token y coordinate must be between 0 and 10000." });
      }
      data.y = nextY;
    }
    if (characterId !== undefined) data.characterId = characterId ? Number(characterId) : null;
    if (npcId !== undefined) data.npcId = npcId ? Number(npcId) : null;
    if (monsterId !== undefined) data.monsterId = monsterId ? Number(monsterId) : null;
    if (stats !== undefined) data.stats = stats;

    // Direct HP sync: if this token is linked to an NPC or Monster and stats are updated with a currentHp,
    // update the NPC's or Monster's HP in the database too.
    const existingToken = await prisma.token.findUnique({
      where: { id: tokenId },
      select: { npcId: true, monsterId: true },
    });
    if (existingToken?.npcId && stats) {
      try {
        const parsedStats = JSON.parse(stats);
        if (parsedStats.currentHp !== undefined) {
          await prisma.npc.update({
            where: { id: existingToken.npcId },
            data: { hp: Math.max(0, Number(parsedStats.currentHp)) },
          });
        }
      } catch (err) {
        console.error("[API] Failed to sync NPC health from token stats:", err.message);
      }
    }
    if (existingToken?.monsterId && stats) {
      try {
        const parsedStats = JSON.parse(stats);
        if (parsedStats.currentHp !== undefined) {
          await prisma.monster.update({
            where: { id: existingToken.monsterId },
            data: { hp: Math.max(0, Number(parsedStats.currentHp)) },
          });
        }
      } catch (err) {
        console.error("[API] Failed to sync Monster health from token stats:", err.message);
      }
    }

    const updatedToken = await prisma.token.update({
      where: { id: tokenId },
      data,
      include: { character: true, npc: true, monster: true },
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
// DELETE /api/tokens/:id  Delete token
// ---------------------------------------------------------------------------
router.delete("/tokens/:id", requireDm, async (req, res) => {
  try {
    const tokenId = Number(req.params.id);
    if (isNaN(tokenId) || tokenId <= 0) {
      return res.status(400).json({ error: "Invalid token id." });
    }
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
