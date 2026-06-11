// =============================================================================
// Tablecast MCP — Handout Tool Handlers
// =============================================================================
"use strict";

async function handleListHandouts(args, { prisma, parseJsonArray, logError }) {
  const where = {};
  if (args.characterId !== undefined) {
    const charId = Number(args.characterId);
    if (Number.isInteger(charId) && charId > 0) {
      // Fetch all handouts and filter in-memory for SQLite JSON compatibility
      const all = await prisma.handout.findMany({ orderBy: { createdAt: "desc" } });
      const filtered = all.filter((h) => {
        const targets = parseJsonArray(h.targetCharacterIds);
        return targets.length === 0 || targets.includes(charId);
      });
      return { content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }] };
    }
  }

  const handouts = await prisma.handout.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return { content: [{ type: "text", text: JSON.stringify(handouts, null, 2) }] };
}

async function handleCreateHandout(args, { prisma, parseJsonArray, toJsonArrayString, logError, getIo }) {
  const { title, content, imageUrl, targetCharacterIds } = args;

  if (!title || typeof title !== "string" || !title.trim()) {
    throw new Error("Handout title is required.");
  }

  let parsedTargets = [];
  if (targetCharacterIds !== undefined) {
    parsedTargets = parseJsonArray(targetCharacterIds);
  }

  const handout = await prisma.handout.create({
    data: {
      title: title.trim(),
      content: String(content || ""),
      imageUrl: String(imageUrl || ""),
      targetCharacterIds: JSON.stringify(parsedTargets),
      createdByDmId: 1, // MCP tools run as DM by default
    },
  });

  // Broadcast via socket
  try {
    const io = getIo();
    if (io) io.emit("handout:new", { handout });
  } catch (err) {
    logError("Failed to broadcast handout:new", err.message);
  }

  return {
    content: [{ type: "text", text: `Handout created successfully:\n${JSON.stringify(handout, null, 2)}` }],
  };
}

async function handleUpdateHandout(args, { prisma, parseJsonArray, toJsonArrayString, logError }) {
  const { id, title, content, imageUrl, targetCharacterIds } = args;

  const handoutId = Number(id);
  if (!Number.isInteger(handoutId) || handoutId <= 0) {
    throw new Error("Handout id must be a valid positive number.");
  }

  const existing = await prisma.handout.findUnique({ where: { id: handoutId } });
  if (!existing) {
    throw new Error(`Handout with ID ${handoutId} not found.`);
  }

  const data = {};

  if (title !== undefined) {
    if (!String(title || "").trim()) {
      throw new Error("title must be a non-empty string.");
    }
    data.title = String(title).trim();
  }

  if (content !== undefined) {
    data.content = String(content || "");
  }

  if (imageUrl !== undefined) {
    data.imageUrl = String(imageUrl || "");
  }

  if (targetCharacterIds !== undefined) {
    const parsed = parseJsonArray(targetCharacterIds);
    data.targetCharacterIds = JSON.stringify(parsed);
  }

  if (Object.keys(data).length === 0) {
    throw new Error("No valid handout fields provided to update.");
  }

  const handout = await prisma.handout.update({
    where: { id: handoutId },
    data,
  });

  return {
    content: [{ type: "text", text: `Handout updated successfully:\n${JSON.stringify(handout, null, 2)}` }],
  };
}

async function handleDeleteHandout(args, { prisma, logError }) {
  const { id } = args;

  const handoutId = Number(id);
  if (!Number.isInteger(handoutId) || handoutId <= 0) {
    throw new Error("Handout id must be a valid positive number.");
  }

  await prisma.handout.delete({ where: { id: handoutId } });

  return {
    content: [{ type: "text", text: `Handout ${handoutId} deleted successfully.` }],
  };
}

module.exports = {
  handleListHandouts,
  handleCreateHandout,
  handleUpdateHandout,
  handleDeleteHandout,
};
