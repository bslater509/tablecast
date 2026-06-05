// =============================================================================
// Tablecast  MCP (Model Context Protocol) Server
// Enables AI agents to read/write characters, wiki pages, and users on Tablecast.
// =============================================================================
"use strict";

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { CallToolRequestSchema, ListToolsRequestSchema } = require("@modelcontextprotocol/sdk/types.js");
const prisma = require("./prisma");

// IMPORTANT: Do NOT use console.log for standard outputs as stdout is reserved
// for JSON-RPC communication. All logging/debugging MUST go to console.error.
const logError = (...args) => console.error("[MCP Server]", ...args);

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

// Ability score modifier calculator
const calculateModifier = (score) => Math.floor((score - 10) / 2);

// Auto-calculate full set of D&D 5e modifiers based on stats object
const generateModifiers = (stats) => {
  return {
    strength: calculateModifier(stats.strength ?? 10),
    dexterity: calculateModifier(stats.dexterity ?? 10),
    constitution: calculateModifier(stats.constitution ?? 10),
    intelligence: calculateModifier(stats.intelligence ?? 10),
    wisdom: calculateModifier(stats.wisdom ?? 10),
    charisma: calculateModifier(stats.charisma ?? 10),
  };
};

// Tool schemas definition
const TOOLS = [
  //  USER TOOLS 
  {
    name: "list_users",
    description: "Get all registered users on the Tablecast server.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "create_user",
    description: "Create a new user profile (DM or PLAYER).",
    inputSchema: {
      type: "object",
      properties: {
        username: { type: "string", description: "Unique username." },
        role: { type: "string", enum: ["DM", "PLAYER"], description: "Role of the user. Default is PLAYER." },
      },
      required: ["username"],
    },
  },

  //  CHARACTER / NPC TOOLS 
  {
    name: "list_characters",
    description: "List all character sheets, optionally filtered by owner userId.",
    inputSchema: {
      type: "object",
      properties: {
        userId: { type: "number", description: "Filter by user ID." },
      },
    },
  },
  {
    name: "create_character",
    description: "Create a character or NPC sheet with stats, inventory, and automatically calculated modifiers.",
    inputSchema: {
      type: "object",
      properties: {
        userId: { type: "number", description: "Owner user ID. NPCs should usually be owned by the DM." },
        name: { type: "string", description: "Character name." },
        race: { type: "string", description: "e.g., High Elf, Dwarf, Human." },
        class: { type: "string", description: "e.g., Fighter, Wizard, Rogue." },
        level: { type: "number", minimum: 1, maximum: 20, description: "Character level (default: 1)." },
        hp: { type: "number", description: "Current hit points (default: 10)." },
        maxHp: { type: "number", description: "Maximum hit points (default: 10)." },
        strength: { type: "number", minimum: 1, maximum: 30, description: "Strength score (default: 10)." },
        dexterity: { type: "number", minimum: 1, maximum: 30, description: "Dexterity score (default: 10)." },
        constitution: { type: "number", minimum: 1, maximum: 30, description: "Constitution score (default: 10)." },
        intelligence: { type: "number", minimum: 1, maximum: 30, description: "Intelligence score (default: 10)." },
        wisdom: { type: "number", minimum: 1, maximum: 30, description: "Wisdom score (default: 10)." },
        charisma: { type: "number", minimum: 1, maximum: 30, description: "Charisma score (default: 10)." },
        inventory: {
          type: "array",
          description: "List of items in character inventory.",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              quantity: { type: "number" },
              weight: { type: "number" },
            },
            required: ["name"],
          },
        },
        modifiers: {
          type: "object",
          description: "Optional custom modifiers object. Auto-calculated if omitted.",
        },
      },
      required: ["userId", "name"],
    },
  },
  {
    name: "update_character",
    description: "Update character stats, class, level, health, or inventory. Modifiers are automatically recalculated if base stats are modified.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Target character ID to update." },
        name: { type: "string" },
        race: { type: "string" },
        class: { type: "string" },
        level: { type: "number" },
        hp: { type: "number" },
        maxHp: { type: "number" },
        strength: { type: "number" },
        dexterity: { type: "number" },
        constitution: { type: "number" },
        intelligence: { type: "number" },
        wisdom: { type: "number" },
        charisma: { type: "number" },
        inventory: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              quantity: { type: "number" },
              weight: { type: "number" },
            },
            required: ["name"],
          },
        },
        modifiers: {
          type: "object",
          description: "Manually override modifiers. Auto-recalculates if stats changed and this is omitted.",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_character",
    description: "Delete a character sheet by ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Character ID to delete." },
      },
      required: ["id"],
    },
  },

  //  WIKI / LORE TOOLS 
  {
    name: "list_wiki_articles",
    description: "Get all wiki articles, including hidden DM logs and lore details.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "create_wiki_article",
    description: "Create a new wiki lore page or location writeup.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Article title (e.g., 'Neverwinter Wood')." },
        content: { type: "string", description: "Markdown text describing the location, NPC lore, or session notes." },
        isVisibleToPlayers: { type: "boolean", description: "Whether this article is readable in the Player Journal (default: false)." },
        tags: { type: "array", items: { type: "string" }, description: "Tags list (e.g., ['Location', 'Forest'])." },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "update_wiki_article",
    description: "Edit article title, markdown content, visibility, or tags.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Target article ID to edit." },
        title: { type: "string" },
        content: { type: "string" },
        isVisibleToPlayers: { type: "boolean" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_wiki_article",
    description: "Delete a wiki article by ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Article ID to delete." },
      },
      required: ["id"],
    },
  },
];

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  logError(`Calling tool: ${name}`, JSON.stringify(args));

  try {
    switch (name) {
      //  USER HANDLERS 
      case "list_users": {
        const users = await prisma.user.findMany({
          orderBy: { id: "asc" },
        });
        return {
          content: [{ type: "text", text: JSON.stringify(users, null, 2) }],
        };
      }

      case "create_user": {
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

      //  CHARACTER HANDLERS 
      case "list_characters": {
        const filter = {};
        if (typeof args.userId === "number") {
          filter.userId = args.userId;
        }
        const characters = await prisma.character.findMany({
          where: filter,
          orderBy: { id: "asc" },
        });

        // Parse JSON fields back to standard JSON types for tool response formatting
        const parsed = characters.map((c) => ({
          ...c,
          inventory: JSON.parse(c.inventory || "[]"),
          modifiers: JSON.parse(c.modifiers || "{}"),
        }));

        return {
          content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        };
      }

      case "create_character": {
        const { userId, name: charName, race, class: cls, level, hp, maxHp, ...rest } = args;

        // Verify owner user exists
        const owner = await prisma.user.findUnique({ where: { id: userId } });
        if (!owner) {
          throw new Error(`User with ID ${userId} does not exist. Create the user first.`);
        }

        // Extract base stats
        const strength = rest.strength ?? 10;
        const dexterity = rest.dexterity ?? 10;
        const constitution = rest.constitution ?? 10;
        const intelligence = rest.intelligence ?? 10;
        const wisdom = rest.wisdom ?? 10;
        const charisma = rest.charisma ?? 10;

        // Modifiers auto-calculation or manual override
        const computedMods = rest.modifiers || generateModifiers({
          strength,
          dexterity,
          constitution,
          intelligence,
          wisdom,
          charisma,
        });

        const inventoryStr = JSON.stringify(args.inventory || []);
        const modifiersStr = JSON.stringify(computedMods);

        const character = await prisma.character.create({
          data: {
            userId,
            name: charName,
            race: race || "",
            class: cls || "",
            level: level || 1,
            hp: hp ?? 10,
            maxHp: maxHp ?? 10,
            strength,
            dexterity,
            constitution,
            intelligence,
            wisdom,
            charisma,
            inventory: inventoryStr,
            modifiers: modifiersStr,
          },
        });

        const parsed = {
          ...character,
          inventory: JSON.parse(character.inventory),
          modifiers: JSON.parse(character.modifiers),
        };

        return {
          content: [
            { type: "text", text: `Character created successfully:\n${JSON.stringify(parsed, null, 2)}` },
          ],
        };
      }

      case "update_character": {
        const { id, name: charName, race, class: cls, level, hp, maxHp, inventory, modifiers, ...statsUpdate } = args;

        // Load existing character to handle stat merging and modifier calculation
        const existing = await prisma.character.findUnique({ where: { id } });
        if (!existing) {
          throw new Error(`Character with ID ${id} not found.`);
        }

        const dataUpdate = {};

        if (charName !== undefined) dataUpdate.name = charName;
        if (race !== undefined) dataUpdate.race = race;
        if (cls !== undefined) dataUpdate.class = cls;
        if (level !== undefined) dataUpdate.level = level;
        if (hp !== undefined) dataUpdate.hp = hp;
        if (maxHp !== undefined) dataUpdate.maxHp = maxHp;

        // Merge stats if updated
        let statsChanged = false;
        const statKeys = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
        for (const key of statKeys) {
          if (statsUpdate[key] !== undefined) {
            dataUpdate[key] = statsUpdate[key];
            statsChanged = true;
          }
        }

        if (inventory !== undefined) {
          dataUpdate.inventory = JSON.stringify(inventory);
        }

        if (modifiers !== undefined) {
          dataUpdate.modifiers = JSON.stringify(modifiers);
        } else if (statsChanged) {
          // If stats changed and no custom modifiers override was passed, recalculate modifiers
          const strength = statsUpdate.strength ?? existing.strength;
          const dexterity = statsUpdate.dexterity ?? existing.dexterity;
          const constitution = statsUpdate.constitution ?? existing.constitution;
          const intelligence = statsUpdate.intelligence ?? existing.intelligence;
          const wisdom = statsUpdate.wisdom ?? existing.wisdom;
          const charisma = statsUpdate.charisma ?? existing.charisma;

          const recomputed = generateModifiers({
            strength,
            dexterity,
            constitution,
            intelligence,
            wisdom,
            charisma,
          });
          dataUpdate.modifiers = JSON.stringify(recomputed);
        }

        const updated = await prisma.character.update({
          where: { id },
          data: dataUpdate,
        });

        const parsed = {
          ...updated,
          inventory: JSON.parse(updated.inventory),
          modifiers: JSON.parse(updated.modifiers),
        };

        return {
          content: [
            { type: "text", text: `Character updated successfully:\n${JSON.stringify(parsed, null, 2)}` },
          ],
        };
      }

      case "delete_character": {
        const { id } = args;
        await prisma.character.delete({ where: { id } });
        return {
          content: [{ type: "text", text: `Character with ID ${id} deleted successfully.` }],
        };
      }

      //  WIKI HANDLERS 
      case "list_wiki_articles": {
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

      case "create_wiki_article": {
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

      case "update_wiki_article": {
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

      case "delete_wiki_article": {
        const { id } = args;
        await prisma.wikiArticle.delete({ where: { id } });
        return {
          content: [{ type: "text", text: `Wiki article with ID ${id} deleted successfully.` }],
        };
      }

      default:
        throw new Error(`Tool ${name} not found`);
    }
  } catch (error) {
    logError(`Error executing tool ${name}:`, error.message);
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

// Run the stdio server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logError("Tablecast MCP Server successfully running on stdio transport");
}

main().catch((err) => {
  logError("Fatal error during MCP initialization:", err);
  process.exit(1);
});
