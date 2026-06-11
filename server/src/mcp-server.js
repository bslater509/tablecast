// =============================================================================
// Tablecast  MCP (Model Context Protocol) Server
// Enables AI agents to read/write characters, NPCs, wiki pages, and users.
// =============================================================================
"use strict";

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { CallToolRequestSchema, ListToolsRequestSchema } = require("@modelcontextprotocol/sdk/types.js");
const prisma = require("./prisma");
const referenceSearch = require("./utils/referenceSearch");
const logger = require("./utils/logger");
const { TOOLS } = require("./mcp/schemas");
const userHandlers = require("./mcp/handlers/users");
const characterHandlers = require("./mcp/handlers/characters");
const npcHandlers = require("./mcp/handlers/npcs");
const monsterHandlers = require("./mcp/handlers/monsters");
const encounterHandlers = require("./mcp/handlers/encounters");
const sessionHandlers = require("./mcp/handlers/sessions");
const wikiHandlers = require("./mcp/handlers/wiki");
const referenceHandlers = require("./mcp/handlers/reference");
const soundtrackHandlers = require("./mcp/handlers/soundtracks");

const {
  generateModifiers,
  parseJsonArray,
  parseJsonObject,
  toJsonArrayString,
  toJsonObjectString,
  VALID_ENCOUNTER_STATUSES,
  VALID_SESSION_STATUSES,
} = require("./mcp/shared");

const HANDLERS = {
  ...userHandlers,
  ...characterHandlers,
  ...npcHandlers,
  ...monsterHandlers,
  ...encounterHandlers,
  ...sessionHandlers,
  ...wikiHandlers,
  ...referenceHandlers,
  ...soundtrackHandlers,
};

// Lazy import — avoids circular dependency (routes/ai → mcp-server → index)
// because getIo() is called at runtime, not module load time.
function getIo() {
  return require("../index").io;
}

// IMPORTANT: Do NOT use console.log for standard outputs as stdout is reserved
// for JSON-RPC communication. All logging/debugging MUST go to console.error.
const logError = (...args) => {
  if (typeof args[0] === "string" && args[0].startsWith("[MCP Server]")) {
    logger.error("mcp", args[0].replace("[MCP Server] ", ""), { detail: args.slice(1).join(" ") });
  } else {
    logger.error("mcp", String(args[0]), { detail: args.slice(1).join(" ") });
  }
};

// Initialize the MCP server
const server = new Server(
  {
    name: "tablecast-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);


// Register MCP request handlers on a given server instance
function registerHandlers(srv) {
  srv.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  // Persist MCP tool call to audit log
  async function persistMcpLog(tool, args, result, isError) {
    try {
      await prisma.mcpLog.create({
        data: {
          tool,
          arguments: JSON.stringify(args || {}),
          result: JSON.stringify(result),
          isError,
        },
      });
    } catch (logErr) {
      logError("Failed to persist MCP audit log:", logErr.message);
    }
  }

  srv.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    logError(`Calling tool: ${name}`, JSON.stringify(args));

    const execute = async () => {
      const handlerName = 'handle' + name.split('_').map(s => s[0].toUpperCase() + s.slice(1)).join('');
      const handler = HANDLERS[handlerName];
      if (!handler) {
        throw new Error(`Tool ${name} not found`);
      }
      const context = {
        prisma,
        referenceSearch,
        logError,
        getIo,
        generateModifiers,
        parseJsonArray,
        parseJsonObject,
        toJsonArrayString,
        toJsonObjectString,
        VALID_ENCOUNTER_STATUSES,
        VALID_SESSION_STATUSES,
      };
      return await handler(args || {}, context);
    };

    try {
      const result = await execute();
      // Fire-and-forget audit log persistence (don't block the response)
      persistMcpLog(name, args, result, false).catch(() => {});
      return result;
    } catch (error) {
      logError(`Error executing tool ${name}:`, error.message);
      const errorResult = {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true,
      };
      // Fire-and-forget audit log persistence
      persistMcpLog(name, args, errorResult, true).catch(() => {});
      return errorResult;
    }
  });

}

// Register handlers on the singleton server
registerHandlers(server);

function createMcpServer() {
  const newServer = new Server(
    {
      name: "tablecast-mcp-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  registerHandlers(newServer);

  return newServer;
}

// Export server instance and factory for web integration
module.exports = { server, createMcpServer };

// Run the stdio server ONLY if run directly
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logError("Tablecast MCP Server successfully running on stdio transport");
}

if (require.main === module) {
  main().catch((err) => {
    logError("Fatal error during MCP initialization:", err);
    process.exit(1);
  });
}
