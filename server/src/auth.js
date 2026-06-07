"use strict";

const prisma = require("./prisma");

function getUserId(req) {
  const raw = req.get("x-tablecast-user-id");
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function getRequestUser(req) {
  const id = getUserId(req);
  if (!id) return null;

  return prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, role: true },
  });
}

async function requireDm(req, res, next) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return res.status(401).json({ error: "A valid user is required." });
    }

    if (user.role !== "DM") {
      return res.status(403).json({ error: "DM privileges are required." });
    }

    req.tablecastUser = user;
    next();
  } catch (err) {
    console.error("[Auth] Failed to verify user:", err.message);
    res.status(500).json({ error: "Failed to verify permissions." });
  }
}

async function isDmUser(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return false;

  const user = await prisma.user.findUnique({
    where: { id },
    select: { role: true },
  });
  return user?.role === "DM";
}

module.exports = { getUserId, getRequestUser, requireDm, isDmUser };
