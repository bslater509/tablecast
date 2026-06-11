// =============================================================================
// Tablecast  User CRUD Routes
// Endpoints:  GET /api/users          (DM users only)
//             GET /api/users/:id
//             PUT /api/users/:id
//             DELETE /api/users/:id
// =============================================================================
"use strict";

const { Router } = require("express");
const prisma = require("../prisma");
const { getRequestUser } = require("../auth");
const logger = require("../utils/logger");

const router = Router();

const VALID_ROLES = ["DM", "PLAYER"];

// ---------------------------------------------------------------------------
// GET /api/users  list all DM users
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const reqUser = await getRequestUser(req);
    const users = await prisma.user.findMany({
      where: { role: "DM" },
      orderBy: { createdAt: "asc" },
    });
    // For unauthenticated requests (login screen), only return safe fields
    if (!reqUser) {
      return res.json(users.map((u) => ({ id: u.id, username: u.username })));
    }
    res.json(users);
  } catch (err) {
    logger.error("api:route", "Error in GET /api/users", { error: err.message });
    res.status(500).json({ error: "Failed to fetch users." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/users/:id  get a single user with their characters
// ---------------------------------------------------------------------------
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    const reqUser = await getRequestUser(req);
    if (!reqUser) {
      return res.status(401).json({ error: "A valid user session is required." });
    }

    const isDM = reqUser.role === "DM";
    if (!isDM && reqUser.id !== id) {
      return res.status(403).json({ error: "You are not authorized to view this user." });
    }

    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    res.json(user);
  } catch (err) {
    logger.error("api:route", "Error in GET /api/users/:id", { error: err.message });
    res.status(500).json({ error: "Failed to fetch user." });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/users/:id  update an existing user
// Body: { username?: string, role?: "DM" | "PLAYER", diceTheme?: string, diceColor?: string }
// ---------------------------------------------------------------------------
router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    const reqUser = await getRequestUser(req);
    if (!reqUser) {
      return res.status(401).json({ error: "A valid user session is required." });
    }

    if (reqUser.id !== id && reqUser.role !== "DM") {
      return res.status(403).json({ error: "You are not authorized to update this user." });
    }

    const { username, role, diceTheme, diceColor } = req.body;

    if (role && !VALID_ROLES.includes(role)) {
      return res
        .status(400)
        .json({ error: `role must be one of: ${VALID_ROLES.join(", ")}` });
    }

    if (role && reqUser.role !== "DM") {
      return res.status(403).json({ error: "Only DMs can change user roles." });
    }

    const data = {};
    if (username && typeof username === "string") data.username = username.trim();
    if (role) data.role = role;
    if (diceTheme !== undefined) {
      const theme = String(diceTheme).slice(0, 100);
      data.diceTheme = theme;
    }
    if (diceColor !== undefined) {
      const color = String(diceColor).slice(0, 100);
      if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
        return res.status(400).json({ error: "diceColor must be a valid hex color (e.g. #7c3aed)." });
      }
      data.diceColor = color;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No valid fields to update." });
    }

    const user = await prisma.user.update({
      where: { id },
      data,
    });

    res.json(user);
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "User not found." });
    }
    if (err.code === "P2002") {
      return res.status(409).json({ error: "Username already taken." });
    }
    logger.error("api:route", "Error in PUT /api/users/:id", { error: err.message });
    res.status(500).json({ error: "Failed to update user." });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/users/:id  delete a user (cascades to their characters)
// ---------------------------------------------------------------------------
router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    const reqUser = await getRequestUser(req);
    if (!reqUser) {
      return res.status(401).json({ error: "A valid user session is required." });
    }

    if (reqUser.id !== id && reqUser.role !== "DM") {
      return res.status(403).json({ error: "You are not authorized to delete this user." });
    }

    await prisma.user.delete({
      where: { id },
    });

    res.json({ message: "User deleted." });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "User not found." });
    }
    logger.error("api:route", "Error in DELETE /api/users/:id", { error: err.message });
    res.status(500).json({ error: "Failed to delete user." });
  }
});

module.exports = router;
