// =============================================================================
// Tablecast — Prisma Client Singleton
// Re-uses a single PrismaClient instance across the app to avoid exhausting
// database connections during development with nodemon/hot-reload.
// =============================================================================
"use strict";

const { PrismaClient } = require("@prisma/client");

/** @type {PrismaClient} */
const prisma = global.__prisma || new PrismaClient();

// In development, attach the client to `global` so it survives nodemon restarts
if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}

module.exports = prisma;
