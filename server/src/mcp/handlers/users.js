// =============================================================================
// Tablecast MCP — User Tool Handlers
// =============================================================================
"use strict";

async function handleListUsers(args, { prisma }) {
  const users = await prisma.user.findMany({
    orderBy: { id: "asc" },
  });
  return {
    content: [{ type: "text", text: JSON.stringify(users, null, 2) }],
  };
}

async function handleCreateUser(args, { prisma }) {
  const { username, role } = args;
  const user = await prisma.user.create({
    data: {
      username,
      role: role || "PLAYER",
    },
  });
  return {
    content: [
      { type: "text", text: `User created successfully:\n${JSON.stringify(user, null, 2)}` },
    ],
  };
}

module.exports = { handleListUsers, handleCreateUser };
