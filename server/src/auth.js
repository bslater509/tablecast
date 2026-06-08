"use strict";

const prisma = require("./prisma");
const debug = require("./utils/debug");
const logger = require("./utils/logger");
const log = debug("tablecast:auth");

function getUserId(req) {
  const raw = req.get("x-tablecast-user-id");
  const id = Number(raw);
  const result = Number.isInteger(id) && id > 0 ? id : null;
  log("getUserId — raw=%s resolved=%s", raw, result);
  return result;
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
      log("requireDm — no valid user (401)");
      return res.status(401).json({ error: "A valid user is required." });
    }

    if (user.role !== "DM") {
      log("requireDm — user=%d role=%s (403)", user.id, user.role);
      return res.status(403).json({ error: "DM privileges are required." });
    }

    req.tablecastUser = user;
    log("requireDm — user=%d authorized as DM", user.id);
    next();
  } catch (err) {
    logger.error("auth", "Failed to verify user", { error: err.message });
    res.status(500).json({ error: "Failed to verify permissions." });
  }
}

async function isDmUser(userId) {
  try {
    const id = Number(userId);
    if (!Number.isInteger(id) || id <= 0) {
      log("isDmUser — invalid userId=%s -> false", userId);
      return false;
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { role: true },
    });
    const result = user?.role === "DM";
    log("isDmUser — userId=%d role=%s -> %s", id, user?.role || "N/A", result);
    return result;
  } catch (err) {
    logger.error("auth", "isDmUser error", { error: err.message });
    return false;
  }
}

module.exports = { getUserId, getRequestUser, requireDm, isDmUser };
