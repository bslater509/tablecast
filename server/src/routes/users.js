// =============================================================================
// Tablecast  User CRUD Routes
// Endpoints:  GET /api/users
//             GET /api/users/:id
//             POST /api/users
//             PUT /api/users/:id
//             DELETE /api/users/:id
// =============================================================================
"use strict";

const { Router } = require("express");
const prisma = require("../prisma");
const { getRequestUser } = require("../auth");

const router = Router();

const VALID_ROLES = ["DM", "PLAYER"];

// ---------------------------------------------------------------------------
// GET /api/users  list all users
// ---------------------------------------------------------------------------
router.get("/", async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      include: { characters: { select: { id: true, name: true } } },
    });
    res.json(users);
  } catch (err) {
    console.error("[API] GET /api/users error:", err.message);
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

    const user = await prisma.user.findUnique({
      where: { id },
      include: { characters: true },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    res.json(user);
  } catch (err) {
    console.error("[API] GET /api/users/:id error:", err.message);
    res.status(500).json({ error: "Failed to fetch user." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/users  create a new user
// Body: { username: string, role?: "DM" | "PLAYER" }
// ---------------------------------------------------------------------------
router.post("/", async (req, res) => {
  try {
    const { username, role } = req.body;

    if (!username || typeof username !== "string" || !username.trim()) {
      return res.status(400).json({ error: "username is required." });
    }

    if (role && role !== "PLAYER") {
      return res.status(400).json({ error: "Only PLAYER role can be created via registration. DM users must be promoted by another DM." });
    }

    const user = await prisma.user.create({
      data: {
        username: username.trim(),
        role: "PLAYER",
      },
    });

    res.status(201).json(user);
  } catch (err) {
    // Prisma unique constraint violation
    if (err.code === "P2002") {
      return res.status(409).json({ error: "Username already taken." });
    }
    console.error("[API] POST /api/users error:", err.message);
    res.status(500).json({ error: "Failed to create user." });
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
    if (diceTheme !== undefined) data.diceTheme = String(diceTheme);
    if (diceColor !== undefined) data.diceColor = String(diceColor);

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No valid fields to update." });
    }

    const user = await prisma.user.update({
      where: { id },
      data,
      include: { characters: { select: { id: true, name: true } } },
    });

    res.json(user);
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "User not found." });
    }
    if (err.code === "P2002") {
      return res.status(409).json({ error: "Username already taken." });
    }
    console.error("[API] PUT /api/users/:id error:", err.message);
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
    console.error("[API] DELETE /api/users/:id error:", err.message);
    res.status(500).json({ error: "Failed to delete user." });
  }
});

module.exports = router;
