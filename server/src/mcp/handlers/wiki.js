// =============================================================================
// Tablecast MCP — Wiki Tool Handlers
// =============================================================================
"use strict";

async function handleListWikiArticles(args, { prisma }) {
  const articles = await prisma.wikiArticle.findMany({
    orderBy: { id: "asc" },
  });

  const parsed = articles.map((a) => ({
    ...a,
    tags: JSON.parse(a.tags || "[]"),
  }));

  return {
    content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
  };
}

async function handleCreateWikiArticle(args, { prisma, getIo }) {
  const { title, content, isVisibleToPlayers, tags } = args;
  const tagsStr = JSON.stringify(tags || []);

  const article = await prisma.wikiArticle.create({
    data: {
      title,
      content,
      isVisibleToPlayers: isVisibleToPlayers ?? false,
      tags: tagsStr,
    },
  });

  // Broadcast to all connected clients
  try { getIo().emit("wiki:article:created", { article }); } catch (_) {}

  const parsed = {
    ...article,
    tags: JSON.parse(article.tags),
  };

  return {
    content: [
      { type: "text", text: `Wiki article created successfully:\n${JSON.stringify(parsed, null, 2)}` },
    ],
  };
}

async function handleUpdateWikiArticle(args, { prisma, getIo }) {
  const { id, title, content, isVisibleToPlayers, tags } = args;

  const dataUpdate = {};
  if (title !== undefined) dataUpdate.title = title;
  if (content !== undefined) dataUpdate.content = content;
  if (isVisibleToPlayers !== undefined) dataUpdate.isVisibleToPlayers = isVisibleToPlayers;
  if (tags !== undefined) dataUpdate.tags = JSON.stringify(tags);

  const updated = await prisma.wikiArticle.update({
    where: { id },
    data: dataUpdate,
  });

  // Broadcast to all connected clients
  try { getIo().emit("wiki:article:updated", { article: updated }); } catch (_) {}

  const parsed = {
    ...updated,
    tags: JSON.parse(updated.tags),
  };

  return {
    content: [
      { type: "text", text: `Wiki article updated successfully:\n${JSON.stringify(parsed, null, 2)}` },
    ],
  };
}

async function handleDeleteWikiArticle(args, { prisma, getIo }) {
  const { id } = args;
  await prisma.wikiArticle.delete({ where: { id } });

  // Broadcast to all connected clients
  try { getIo().emit("wiki:article:deleted", { id }); } catch (_) {}

  return {
    content: [{ type: "text", text: `Wiki article with ID ${id} deleted successfully.` }],
  };
}

module.exports = {
  handleListWikiArticles,
  handleCreateWikiArticle,
  handleUpdateWikiArticle,
  handleDeleteWikiArticle,
};
