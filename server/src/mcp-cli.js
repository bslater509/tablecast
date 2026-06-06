#!/usr/bin/env node
/**
 * Tablecast MCP CLI Utility
 * Usage: node src/mcp-cli.js <tool_name> '<json_arguments>'
 * Example: node src/mcp-cli.js create_npc '{"name": "Grog", "race": "Half-Orc"}'
 */
"use strict";

const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const path = require("path");

const toolName = process.argv[2];
const argsStr = process.argv[3];

if (!toolName) {
  console.error("Usage: node src/mcp-cli.js <tool_name> '<json_arguments>'");
  console.error("Example: node src/mcp-cli.js list_npcs '{}'");
  process.exit(1);
}

let toolArgs = {};
if (argsStr) {
  try {
    toolArgs = JSON.parse(argsStr);
  } catch (err) {
    console.error("Error: Second argument must be a valid JSON string.");
    console.error("Received:", argsStr);
    console.error(err.message);
    process.exit(1);
  }
}

async function main() {
  const client = new Client({
    name: "tablecast-mcp-cli",
    version: "1.0.0"
  }, {
    capabilities: {}
  });

  const serverPath = path.resolve(__dirname, "mcp-server.js");
  const transport = new StdioClientTransport({
    command: "node",
    args: [serverPath],
    cwd: path.resolve(__dirname, ".."),
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL || "file:./data/tablecast.db"
    }
  });

  await client.connect(transport);

  try {
    const response = await client.callTool({
      name: toolName,
      arguments: toolArgs
    });

    if (response && response.content && response.content[0]) {
      console.log(response.content[0].text);
    } else {
      console.log("Success (no output returned).");
    }
  } catch (err) {
    console.error(`Error calling tool "${toolName}":`, err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
