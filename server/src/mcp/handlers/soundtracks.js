// =============================================================================
// Tablecast MCP — Soundtrack Tool Handlers
// =============================================================================
"use strict";

const prisma = require("../../prisma");

async function handleListSoundtracks(args, _context) {
  const where = {};
  if (args.category) where.category = args.category;
  const tracks = await prisma.soundtrack.findMany({ where, orderBy: { createdAt: "asc" } });
  return { content: [{ type: "text", text: JSON.stringify(tracks, null, 2) }] };
}

async function handleCreateSoundtrack(args, _context) {
  const track = await prisma.soundtrack.create({
    data: {
      name: args.name,
      category: args.category || "AMBIENT",
      filePath: args.filePath,
      duration: args.duration || 0,
      loop: args.loop || false,
    },
  });
  return { content: [{ type: "text", text: JSON.stringify(track, null, 2) }] };
}

async function handleUpdateSoundtrack(args, _context) {
  const data = {};
  if (args.name !== undefined) data.name = args.name;
  if (args.category !== undefined) data.category = args.category;
  if (args.filePath !== undefined) data.filePath = args.filePath;
  if (args.duration !== undefined) data.duration = args.duration;
  if (args.loop !== undefined) data.loop = args.loop;
  const track = await prisma.soundtrack.update({ where: { id: args.id }, data });
  return { content: [{ type: "text", text: JSON.stringify(track, null, 2) }] };
}

async function handleDeleteSoundtrack(args, _context) {
  await prisma.soundtrack.delete({ where: { id: args.id } });
  return { content: [{ type: "text", text: `Soundtrack ${args.id} deleted.` }] };
}

module.exports = { handleListSoundtracks, handleCreateSoundtrack, handleUpdateSoundtrack, handleDeleteSoundtrack };
