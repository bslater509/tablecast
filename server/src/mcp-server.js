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

const safeJsonParse = (value, fallback) => {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
};

const parseJsonArray = (value) => {
  const parsed = safeJsonParse(value, []);
  return Array.isArray(parsed) ? parsed : [];
};

const parseJsonObject = (value) => {
  const parsed = safeJsonParse(value, {});
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
};

const toJsonArrayString = (value, fieldName, fallback = []) => {
  if (value === undefined || value === null || value === "") {
    return JSON.stringify(fallback);
  }

  const parsed = typeof value === "string" ? safeJsonParse(value, null) : value;
  if (!Array.isArray(parsed)) {
    throw new Error(`${fieldName} must be a JSON array.`);
  }

  return JSON.stringify(parsed);
};

const toJsonObjectString = (value, fieldName, fallback = {}) => {
  if (value === undefined || value === null || value === "") {
    return JSON.stringify(fallback);
  }

  const parsed = typeof value === "string" ? safeJsonParse(value, null) : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${fieldName} must be a JSON object.`);
  }

  return JSON.stringify(parsed);
};

const VALID_ENCOUNTER_STATUSES = new Set(["DRAFT", "ACTIVE", "COMPLETE"]);
const VALID_SESSION_STATUSES = new Set(["PLANNED", "ACTIVE", "COMPLETE"]);

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

  //  CHARACTER TOOLS
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
    description: "Create a character sheet with stats, inventory, and automatically calculated modifiers.",
    inputSchema: {
      type: "object",
      properties: {
        userId: { type: "number", description: "Owner user ID." },
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

  //  NPC TOOLS
  {
    name: "list_npcs",
    description: "List all custom NPC templates created by the DM, optionally filtered by name.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Filter by name (partial match)." },
      },
    },
  },
  {
    name: "create_npc",
    description: "Create an NPC template (monster-like statblock) in the database.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "NPC name." },
        race: { type: "string", description: "NPC race." },
        class: { type: "string", description: "NPC class." },
        level: { type: "number", description: "NPC level (default: 1)." },
        hp: { type: "number", description: "Current hit points (default: 10)." },
        maxHp: { type: "number", description: "Maximum hit points (default: 10)." },
        ac: { type: "number", description: "Armor Class (default: 10)." },
        cr: { type: "string", description: "Challenge Rating, e.g. '1/4', '1', '5' (default: '0')." },
        imageUrl: { type: "string", description: "NPC image/avatar URL." },
        largeImageUrl: { type: "string", description: "NPC large portrait URL." },
        strength: { type: "number", description: "Strength score (default: 10)." },
        dexterity: { type: "number", description: "Dexterity score (default: 10)." },
        constitution: { type: "number", description: "Constitution score (default: 10)." },
        intelligence: { type: "number", description: "Intelligence score (default: 10)." },
        wisdom: { type: "number", description: "Wisdom score (default: 10)." },
        charisma: { type: "number", description: "Charisma score (default: 10)." },
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
        actions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              toHit: { type: "number" },
              damage: { type: "string" },
            },
            required: ["name", "description"],
          },
        },
        description: { type: "string", description: "Narrative/GM description." },
        alignment: { type: "string", description: "NPC alignment (e.g. Neutral Good)." },
        appearance: { type: "string", description: "Physical appearance details." },
        personality: { type: "string", description: "Personality traits." },
        history: { type: "string", description: "Backstory / Lore." },
        partyRelationship: { type: "string", description: "Relationship with the adventuring party." },
        isVisibleToPlayers: { type: "boolean", description: "Whether players can see this NPC in the wiki (default: false)." },
      },
      required: ["name"],
    },
  },
  {
    name: "update_npc",
    description: "Update fields on an NPC template.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Target NPC ID to update." },
        name: { type: "string" },
        race: { type: "string" },
        class: { type: "string" },
        level: { type: "number" },
        hp: { type: "number" },
        maxHp: { type: "number" },
        ac: { type: "number" },
        cr: { type: "string" },
        imageUrl: { type: "string" },
        largeImageUrl: { type: "string" },
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
        actions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              toHit: { type: "number" },
              damage: { type: "string" },
            },
            required: ["name", "description"],
          },
        },
        description: { type: "string", description: "Narrative/GM description." },
        alignment: { type: "string", description: "NPC alignment (e.g. Neutral Good)." },
        appearance: { type: "string", description: "Physical appearance details." },
        personality: { type: "string", description: "Personality traits." },
        history: { type: "string", description: "Backstory / Lore." },
        partyRelationship: { type: "string", description: "Relationship with the adventuring party." },
        isVisibleToPlayers: { type: "boolean", description: "Whether players can see this NPC in the wiki." },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_npc",
    description: "Delete an NPC template by ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "NPC template ID to delete." },
      },
      required: ["id"],
    },
  },

  //  MONSTER TOOLS
  {
    name: "list_monsters",
    description: "List all monsters, optionally filtered by name.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Filter by name (partial match)." },
      },
    },
  },
  {
    name: "create_monster",
    description: "Create a monster with full statblock (same fields as create_npc).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Monster name." },
        race: { type: "string", description: "Monster race/type." },
        class: { type: "string", description: "Monster class." },
        level: { type: "number", description: "Monster level (default: 1)." },
        hp: { type: "number", description: "Current hit points (default: 10)." },
        maxHp: { type: "number", description: "Maximum hit points (default: 10)." },
        ac: { type: "number", description: "Armor Class (default: 10)." },
        cr: { type: "string", description: "Challenge Rating, e.g. '1/4', '1', '5' (default: '0')." },
        imageUrl: { type: "string", description: "Monster image/avatar URL." },
        largeImageUrl: { type: "string", description: "Monster large portrait URL." },
        strength: { type: "number", description: "Strength score (default: 10)." },
        dexterity: { type: "number", description: "Dexterity score (default: 10)." },
        constitution: { type: "number", description: "Constitution score (default: 10)." },
        intelligence: { type: "number", description: "Intelligence score (default: 10)." },
        wisdom: { type: "number", description: "Wisdom score (default: 10)." },
        charisma: { type: "number", description: "Charisma score (default: 10)." },
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
        actions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              toHit: { type: "number" },
              damage: { type: "string" },
            },
            required: ["name", "description"],
          },
        },
        modifiers: {
          type: "object",
          description: "Optional custom modifiers object. Auto-calculated if omitted.",
        },
        description: { type: "string", description: "Narrative/GM description." },
        alignment: { type: "string", description: "Monster alignment (e.g. Neutral Good)." },
        appearance: { type: "string", description: "Physical appearance details." },
        personality: { type: "string", description: "Personality traits." },
        history: { type: "string", description: "Backstory / Lore." },
        partyRelationship: { type: "string", description: "Relationship with the adventuring party." },
        isVisibleToPlayers: { type: "boolean", description: "Whether players can see this Monster in the wiki." },
      },
      required: ["name"],
    },
  },
  {
    name: "update_monster",
    description: "Update monster fields (same fields as update_npc).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Target monster ID to update." },
        name: { type: "string" },
        race: { type: "string" },
        class: { type: "string" },
        level: { type: "number" },
        hp: { type: "number" },
        maxHp: { type: "number" },
        ac: { type: "number" },
        cr: { type: "string" },
        imageUrl: { type: "string" },
        largeImageUrl: { type: "string" },
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
        actions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              toHit: { type: "number" },
              damage: { type: "string" },
            },
            required: ["name", "description"],
          },
        },
        modifiers: {
          type: "object",
          description: "Manually override modifiers. Auto-recalculates if stats changed and this is omitted.",
        },
        description: { type: "string", description: "Narrative/GM description." },
        alignment: { type: "string", description: "Monster alignment (e.g. Neutral Good)." },
        appearance: { type: "string", description: "Physical appearance details." },
        personality: { type: "string", description: "Personality traits." },
        history: { type: "string", description: "Backstory / Lore." },
        partyRelationship: { type: "string", description: "Relationship with the adventuring party." },
        isVisibleToPlayers: { type: "boolean", description: "Whether players can see this Monster in the wiki." },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_monster",
    description: "Delete a monster by ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Monster ID to delete." },
      },
      required: ["id"],
    },
  },

  //  ENCOUNTER TOOLS
  {
    name: "list_encounters",
    description: "List all encounters, optionally filtered by mapId or status.",
    inputSchema: {
      type: "object",
      properties: {
        mapId: { type: "number", description: "Filter by map ID." },
        status: { type: "string", enum: ["DRAFT", "ACTIVE", "COMPLETE"], description: "Filter by status." },
      },
    },
  },
  {
    name: "create_encounter",
    description: "Create a combat encounter.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Encounter name." },
        mapId: { type: "number", description: "Target map ID." },
        status: { type: "string", enum: ["DRAFT", "ACTIVE", "COMPLETE"], description: "Encounter status (default: DRAFT)." },
      },
      required: ["name", "mapId"],
    },
  },
  {
    name: "update_encounter",
    description: "Update encounter fields.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Encounter ID to update." },
        name: { type: "string" },
        status: { type: "string", enum: ["DRAFT", "ACTIVE", "COMPLETE"] },
        round: { type: "number" },
        turnIndex: { type: "number" },
      },
      required: ["id"],
    },
  },
  {
    name: "add_encounter_participant",
    description: "Add a combatant to an encounter.",
    inputSchema: {
      type: "object",
      properties: {
        encounterId: { type: "number", description: "Encounter ID." },
        name: { type: "string", description: "Combatant name." },
        npcId: { type: "number" },
        characterId: { type: "number" },
        monsterId: { type: "number" },
        currentHp: { type: "number" },
        maxHp: { type: "number" },
        ac: { type: "number" },
        isHidden: { type: "boolean" },
        initiative: { type: "number" },
      },
      required: ["encounterId", "name"],
    },
  },
  {
    name: "update_encounter_participant",
    description: "Update a participant in an encounter.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Participant ID to update." },
        name: { type: "string" },
        currentHp: { type: "number" },
        maxHp: { type: "number" },
        ac: { type: "number" },
        isHidden: { type: "boolean" },
        initiative: { type: "number" },
      },
      required: ["id"],
    },
  },

  //  SESSION TOOLS
  {
    name: "list_sessions",
    description: "List all game sessions, optionally filtered by status.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["PLANNED", "ACTIVE", "COMPLETE"], description: "Filter by status." },
      },
    },
  },
  {
    name: "create_session",
    description: "Create a game session.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Session title." },
        sessionNumber: { type: "number", description: "Session number." },
        status: { type: "string", enum: ["PLANNED", "ACTIVE", "COMPLETE"], description: "Session status (default: PLANNED)." },
        scheduledFor: { type: "string", description: "ISO date string." },
        agenda: { type: "string" },
        recap: { type: "string" },
        isVisibleToPlayers: { type: "boolean" },
      },
      required: ["title"],
    },
  },
  {
    name: "update_session",
    description: "Update session fields.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Session ID to update." },
        title: { type: "string" },
        sessionNumber: { type: "number" },
        status: { type: "string", enum: ["PLANNED", "ACTIVE", "COMPLETE"] },
        scheduledFor: { type: "string" },
        agenda: { type: "string" },
        recap: { type: "string" },
        isVisibleToPlayers: { type: "boolean" },
        prepChecklist: { type: "string", description: "JSON array string." },
        linkedWikiIds: { type: "string", description: "JSON array string." },
        linkedMapIds: { type: "string", description: "JSON array string." },
        linkedEncounterIds: { type: "string", description: "JSON array string." },
      },
      required: ["id"],
    },
  },

  //  ITEM MANAGEMENT TOOLS
  {
    name: "add_item_to_character",
    description: "Equip a character sheet with an item in their inventory.",
    inputSchema: {
      type: "object",
      properties: {
        characterId: { type: "number", description: "Target Character ID." },
        name: { type: "string", description: "Item name." },
        quantity: { type: "number", description: "Quantity to add. Default is 1." },
        weight: { type: "number", description: "Optional item weight." },
      },
      required: ["characterId", "name"],
    },
  },
  {
    name: "add_item_to_npc",
    description: "Equip an NPC template with an item in their inventory.",
    inputSchema: {
      type: "object",
      properties: {
        npcId: { type: "number", description: "Target NPC template ID." },
        name: { type: "string", description: "Item name." },
        quantity: { type: "number", description: "Quantity to add. Default is 1." },
        weight: { type: "number", description: "Optional item weight." },
      },
      required: ["npcId", "name"],
    },
  },

  //  D&D RULES & LORE TOOLS
  {
    name: "search_reference",
    description: "Search local 5etools reference library for Spells, Monsters, Items, Rules, Classes, or Races.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", enum: ["spells", "monsters", "items", "rules", "classes", "races"], description: "Reference category." },
        query: { type: "string", description: "Search query string." },
        limit: { type: "number", description: "Limit max results (default: 10)." },
      },
      required: ["category", "query"],
    },
  },
  {
    name: "get_reference_detail",
    description: "Retrieve full detail of a specific spell, monster, item, rule, class, or race by name.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", enum: ["spells", "monsters", "items", "rules", "classes", "races"], description: "Reference category." },
        name: { type: "string", description: "Exact name of the record." },
        source: { type: "string", description: "Optional source book acronym, e.g. 'MM', 'PHB'." },
      },
      required: ["category", "name"],
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

// Register MCP request handlers on a given server instance
function registerHandlers(srv) {
  srv.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  srv.setRequestHandler(CallToolRequestSchema, async (request) => {
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

      //  NPC HANDLERS
      case "list_npcs": {
        const filter = {};
        if (args.name) {
          filter.name = { contains: args.name };
        }
        const npcs = await prisma.npc.findMany({
          where: filter,
          orderBy: { id: "asc" },
        });

        const parsed = npcs.map((n) => ({
          ...n,
          inventory: JSON.parse(n.inventory || "[]"),
          modifiers: JSON.parse(n.modifiers || "{}"),
          actions: JSON.parse(n.actions || "[]"),
        }));

        return {
          content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        };
      }

      case "create_npc": {
        const {
          name: npcName,
          race,
          class: cls,
          level,
          hp,
          maxHp,
          ac,
          cr,
          imageUrl,
          largeImageUrl,
          description,
          alignment,
          appearance,
          personality,
          history,
          partyRelationship,
          isVisibleToPlayers,
          ...rest
        } = args;

        const strength = rest.strength ?? 10;
        const dexterity = rest.dexterity ?? 10;
        const constitution = rest.constitution ?? 10;
        const intelligence = rest.intelligence ?? 10;
        const wisdom = rest.wisdom ?? 10;
        const charisma = rest.charisma ?? 10;

        const computedMods = rest.modifiers || generateModifiers({
          strength,
          dexterity,
          constitution,
          intelligence,
          wisdom,
          charisma,
        });

        const inventoryStr = JSON.stringify(args.inventory || []);
        const actionsStr = JSON.stringify(args.actions || []);
        const modifiersStr = JSON.stringify(computedMods);

        const npc = await prisma.npc.create({
          data: {
            name: npcName,
            race: race || "",
            class: cls || "",
            level: level || 1,
            hp: hp ?? 10,
            maxHp: maxHp ?? 10,
            ac: ac ?? 10,
            cr: cr || "0",
            imageUrl: imageUrl || "",
            largeImageUrl: largeImageUrl || "",
            strength,
            dexterity,
            constitution,
            intelligence,
            wisdom,
            charisma,
            inventory: inventoryStr,
            actions: actionsStr,
            modifiers: modifiersStr,
            description: description || "",
            alignment: alignment || "",
            appearance: appearance || "",
            personality: personality || "",
            history: history || "",
            partyRelationship: partyRelationship || "",
            isVisibleToPlayers: isVisibleToPlayers ?? false,
          },
        });

        const parsed = {
          ...npc,
          inventory: JSON.parse(npc.inventory),
          actions: JSON.parse(npc.actions),
          modifiers: JSON.parse(npc.modifiers),
        };

        return {
          content: [{ type: "text", text: `NPC created successfully:\n${JSON.stringify(parsed, null, 2)}` }],
        };
      }

      case "update_npc": {
        const {
          id,
          name: npcName,
          race,
          class: cls,
          level,
          hp,
          maxHp,
          ac,
          cr,
          imageUrl,
          largeImageUrl,
          inventory,
          actions,
          modifiers,
          description,
          alignment,
          appearance,
          personality,
          history,
          partyRelationship,
          isVisibleToPlayers,
          ...statsUpdate
        } = args;

        const existing = await prisma.npc.findUnique({ where: { id } });
        if (!existing) {
          throw new Error(`NPC with ID ${id} not found.`);
        }

        const dataUpdate = {};
        if (npcName !== undefined) dataUpdate.name = npcName;
        if (race !== undefined) dataUpdate.race = race;
        if (cls !== undefined) dataUpdate.class = cls;
        if (level !== undefined) dataUpdate.level = level;
        if (hp !== undefined) dataUpdate.hp = hp;
        if (maxHp !== undefined) dataUpdate.maxHp = maxHp;
        if (ac !== undefined) dataUpdate.ac = ac;
        if (cr !== undefined) dataUpdate.cr = cr;
        if (imageUrl !== undefined) dataUpdate.imageUrl = imageUrl;
        if (largeImageUrl !== undefined) dataUpdate.largeImageUrl = largeImageUrl;
        if (description !== undefined) dataUpdate.description = description;
        if (alignment !== undefined) dataUpdate.alignment = alignment;
        if (appearance !== undefined) dataUpdate.appearance = appearance;
        if (personality !== undefined) dataUpdate.personality = personality;
        if (history !== undefined) dataUpdate.history = history;
        if (partyRelationship !== undefined) dataUpdate.partyRelationship = partyRelationship;
        if (isVisibleToPlayers !== undefined) dataUpdate.isVisibleToPlayers = isVisibleToPlayers;

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
        if (actions !== undefined) {
          dataUpdate.actions = JSON.stringify(actions);
        }

        if (modifiers !== undefined) {
          dataUpdate.modifiers = JSON.stringify(modifiers);
        } else if (statsChanged) {
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

        const updated = await prisma.npc.update({
          where: { id },
          data: dataUpdate,
        });

        const parsed = {
          ...updated,
          inventory: JSON.parse(updated.inventory),
          actions: JSON.parse(updated.actions),
          modifiers: JSON.parse(updated.modifiers),
        };

        return {
          content: [{ type: "text", text: `NPC updated successfully:\n${JSON.stringify(parsed, null, 2)}` }],
        };
      }

      case "delete_npc": {
        const { id } = args;
        await prisma.npc.delete({ where: { id } });
        return {
          content: [{ type: "text", text: `NPC template with ID ${id} deleted successfully.` }],
        };
      }

      //  MONSTER HANDLERS
      case "list_monsters": {
        const filter = {};
        if (args.name) {
          filter.name = { contains: args.name };
        }

        const monsters = await prisma.monster.findMany({
          where: filter,
          orderBy: { id: "asc" },
        });

        const parsed = monsters.map((monster) => ({
          ...monster,
          inventory: parseJsonArray(monster.inventory),
          modifiers: parseJsonObject(monster.modifiers),
          actions: parseJsonArray(monster.actions),
        }));

        return {
          content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        };
      }

      case "create_monster": {
        const {
          name: monsterName,
          race,
          class: cls,
          level,
          hp,
          maxHp,
          ac,
          cr,
          imageUrl,
          largeImageUrl,
          description,
          alignment,
          appearance,
          personality,
          history,
          partyRelationship,
          isVisibleToPlayers,
          ...rest
        } = args;

        if (!monsterName || typeof monsterName !== "string" || !monsterName.trim()) {
          throw new Error("Monster name is required.");
        }

        const strength = rest.strength ?? 10;
        const dexterity = rest.dexterity ?? 10;
        const constitution = rest.constitution ?? 10;
        const intelligence = rest.intelligence ?? 10;
        const wisdom = rest.wisdom ?? 10;
        const charisma = rest.charisma ?? 10;

        const computedMods = rest.modifiers || generateModifiers({
          strength,
          dexterity,
          constitution,
          intelligence,
          wisdom,
          charisma,
        });

        const monster = await prisma.monster.create({
          data: {
            name: monsterName.trim(),
            race: race || "",
            class: cls || "",
            level: level || 1,
            hp: hp ?? 10,
            maxHp: maxHp ?? 10,
            ac: ac ?? 10,
            cr: cr || "0",
            imageUrl: imageUrl || "",
            largeImageUrl: largeImageUrl || "",
            strength,
            dexterity,
            constitution,
            intelligence,
            wisdom,
            charisma,
            inventory: toJsonArrayString(args.inventory, "inventory", []),
            modifiers: toJsonObjectString(computedMods, "modifiers", {}),
            actions: toJsonArrayString(args.actions, "actions", []),
            description: description || "",
            alignment: alignment || "",
            appearance: appearance || "",
            personality: personality || "",
            history: history || "",
            partyRelationship: partyRelationship || "",
            isVisibleToPlayers: isVisibleToPlayers ?? false,
          },
        });

        const parsed = {
          ...monster,
          inventory: parseJsonArray(monster.inventory),
          modifiers: parseJsonObject(monster.modifiers),
          actions: parseJsonArray(monster.actions),
        };

        return {
          content: [{ type: "text", text: `Monster created successfully:\n${JSON.stringify(parsed, null, 2)}` }],
        };
      }

      case "update_monster": {
        const {
          id,
          name: monsterName,
          race,
          class: cls,
          level,
          hp,
          maxHp,
          ac,
          cr,
          imageUrl,
          largeImageUrl,
          inventory,
          modifiers,
          actions,
          description,
          alignment,
          appearance,
          personality,
          history,
          partyRelationship,
          isVisibleToPlayers,
          ...statsUpdate
        } = args;

        const monsterId = Number(id);
        if (!Number.isInteger(monsterId) || monsterId <= 0) {
          throw new Error("Monster id must be a valid positive number.");
        }

        const existing = await prisma.monster.findUnique({ where: { id: monsterId } });
        if (!existing) {
          throw new Error(`Monster with ID ${monsterId} not found.`);
        }

        const dataUpdate = {};
        if (monsterName !== undefined) dataUpdate.name = monsterName;
        if (race !== undefined) dataUpdate.race = race;
        if (cls !== undefined) dataUpdate.class = cls;
        if (level !== undefined) dataUpdate.level = level;
        if (hp !== undefined) dataUpdate.hp = hp;
        if (maxHp !== undefined) dataUpdate.maxHp = maxHp;
        if (ac !== undefined) dataUpdate.ac = ac;
        if (cr !== undefined) dataUpdate.cr = cr;
        if (imageUrl !== undefined) dataUpdate.imageUrl = imageUrl;
        if (largeImageUrl !== undefined) dataUpdate.largeImageUrl = largeImageUrl;
        if (description !== undefined) dataUpdate.description = description;
        if (alignment !== undefined) dataUpdate.alignment = alignment;
        if (appearance !== undefined) dataUpdate.appearance = appearance;
        if (personality !== undefined) dataUpdate.personality = personality;
        if (history !== undefined) dataUpdate.history = history;
        if (partyRelationship !== undefined) dataUpdate.partyRelationship = partyRelationship;
        if (isVisibleToPlayers !== undefined) dataUpdate.isVisibleToPlayers = isVisibleToPlayers;

        let statsChanged = false;
        const statKeys = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
        for (const key of statKeys) {
          if (statsUpdate[key] !== undefined) {
            dataUpdate[key] = statsUpdate[key];
            statsChanged = true;
          }
        }

        if (inventory !== undefined) {
          dataUpdate.inventory = toJsonArrayString(inventory, "inventory", []);
        }
        if (actions !== undefined) {
          dataUpdate.actions = toJsonArrayString(actions, "actions", []);
        }

        if (modifiers !== undefined) {
          dataUpdate.modifiers = toJsonObjectString(modifiers, "modifiers", {});
        } else if (statsChanged) {
          const strength = statsUpdate.strength ?? existing.strength;
          const dexterity = statsUpdate.dexterity ?? existing.dexterity;
          const constitution = statsUpdate.constitution ?? existing.constitution;
          const intelligence = statsUpdate.intelligence ?? existing.intelligence;
          const wisdom = statsUpdate.wisdom ?? existing.wisdom;
          const charisma = statsUpdate.charisma ?? existing.charisma;

          dataUpdate.modifiers = JSON.stringify(generateModifiers({
            strength,
            dexterity,
            constitution,
            intelligence,
            wisdom,
            charisma,
          }));
        }

        if (Object.keys(dataUpdate).length === 0) {
          throw new Error("No valid monster fields provided to update.");
        }

        const updated = await prisma.monster.update({
          where: { id: monsterId },
          data: dataUpdate,
        });

        const parsed = {
          ...updated,
          inventory: parseJsonArray(updated.inventory),
          modifiers: parseJsonObject(updated.modifiers),
          actions: parseJsonArray(updated.actions),
        };

        return {
          content: [{ type: "text", text: `Monster updated successfully:\n${JSON.stringify(parsed, null, 2)}` }],
        };
      }

      case "delete_monster": {
        const { id } = args;
        const monsterId = Number(id);
        if (!Number.isInteger(monsterId) || monsterId <= 0) {
          throw new Error("Monster id must be a valid positive number.");
        }
        await prisma.monster.delete({ where: { id: monsterId } });
        return {
          content: [{ type: "text", text: `Monster with ID ${monsterId} deleted successfully.` }],
        };
      }

      //  ENCOUNTER HANDLERS
      case "list_encounters": {
        const filter = {};
        if (args.mapId !== undefined) {
          const parsedMapId = Number(args.mapId);
          if (!Number.isInteger(parsedMapId) || parsedMapId <= 0) {
            throw new Error("mapId must be a valid positive number.");
          }
          filter.mapId = parsedMapId;
        }
        if (args.status !== undefined) {
          const status = String(args.status).toUpperCase();
          if (!VALID_ENCOUNTER_STATUSES.has(status)) {
            throw new Error("Encounter status must be DRAFT, ACTIVE, or COMPLETE.");
          }
          filter.status = status;
        }

        const encounters = await prisma.encounter.findMany({
          where: filter,
          include: {
            participants: {
              orderBy: [{ initiative: "desc" }, { sortOrder: "asc" }, { id: "asc" }],
            },
          },
          orderBy: { id: "asc" },
        });

        const parsed = encounters.map((encounter) => ({
          ...encounter,
          participants: encounter.participants.map((participant) => ({
            ...participant,
            stats: parseJsonObject(participant.stats),
          })),
        }));

        return {
          content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        };
      }

      case "create_encounter": {
        const { name, mapId, status } = args;

        if (!name || typeof name !== "string" || !name.trim()) {
          throw new Error("Encounter name is required.");
        }

        const parsedMapId = Number(mapId);
        if (!Number.isInteger(parsedMapId) || parsedMapId <= 0) {
          throw new Error("mapId must be a valid positive number.");
        }

        const map = await prisma.map.findUnique({ where: { id: parsedMapId } });
        if (!map) {
          throw new Error(`Map with ID ${parsedMapId} does not exist.`);
        }

        const nextStatus = status ? String(status).toUpperCase() : "DRAFT";
        if (!VALID_ENCOUNTER_STATUSES.has(nextStatus)) {
          throw new Error("Encounter status must be DRAFT, ACTIVE, or COMPLETE.");
        }

        const encounter = await prisma.encounter.create({
          data: {
            name: name.trim(),
            mapId: parsedMapId,
            status: nextStatus,
            round: 1,
            turnIndex: 0,
          },
          include: {
            participants: true,
          },
        });

        const parsed = {
          ...encounter,
          participants: [],
        };

        return {
          content: [{ type: "text", text: `Encounter created successfully:\n${JSON.stringify(parsed, null, 2)}` }],
        };
      }

      case "update_encounter": {
        const { id, name, status, round, turnIndex } = args;

        const encounterId = Number(id);
        if (!Number.isInteger(encounterId) || encounterId <= 0) {
          throw new Error("Encounter id must be a valid positive number.");
        }

        const existing = await prisma.encounter.findUnique({ where: { id: encounterId } });
        if (!existing) {
          throw new Error(`Encounter with ID ${encounterId} not found.`);
        }

        const dataUpdate = {};
        if (name !== undefined) {
          if (!String(name || "").trim()) {
            throw new Error("Encounter name must be a non-empty string.");
          }
          dataUpdate.name = String(name).trim();
        }
        if (status !== undefined) {
          const nextStatus = String(status).toUpperCase();
          if (!VALID_ENCOUNTER_STATUSES.has(nextStatus)) {
            throw new Error("Encounter status must be DRAFT, ACTIVE, or COMPLETE.");
          }
          dataUpdate.status = nextStatus;
        }
        if (round !== undefined) {
          const parsedRound = Number(round);
          if (!Number.isInteger(parsedRound) || parsedRound < 1) {
            throw new Error("round must be a positive integer.");
          }
          dataUpdate.round = parsedRound;
        }
        if (turnIndex !== undefined) {
          const parsedTurnIndex = Number(turnIndex);
          if (!Number.isInteger(parsedTurnIndex) || parsedTurnIndex < 0) {
            throw new Error("turnIndex must be a non-negative integer.");
          }
          dataUpdate.turnIndex = parsedTurnIndex;
        }

        if (Object.keys(dataUpdate).length === 0) {
          throw new Error("No valid encounter fields provided to update.");
        }

        const updated = await prisma.encounter.update({
          where: { id: encounterId },
          data: dataUpdate,
          include: {
            participants: {
              orderBy: [{ initiative: "desc" }, { sortOrder: "asc" }, { id: "asc" }],
            },
          },
        });

        const parsed = {
          ...updated,
          participants: updated.participants.map((participant) => ({
            ...participant,
            stats: parseJsonObject(participant.stats),
          })),
        };

        return {
          content: [{ type: "text", text: `Encounter updated successfully:\n${JSON.stringify(parsed, null, 2)}` }],
        };
      }

      case "add_encounter_participant": {
        const {
          encounterId,
          name,
          npcId,
          characterId,
          monsterId,
          currentHp,
          maxHp,
          ac,
          isHidden,
          initiative,
        } = args;

        const parsedEncounterId = Number(encounterId);
        if (!Number.isInteger(parsedEncounterId) || parsedEncounterId <= 0) {
          throw new Error("encounterId must be a valid positive number.");
        }

        if (!name || typeof name !== "string" || !name.trim()) {
          throw new Error("Participant name is required.");
        }

        const encounter = await prisma.encounter.findUnique({ where: { id: parsedEncounterId } });
        if (!encounter) {
          throw new Error(`Encounter with ID ${parsedEncounterId} not found.`);
        }

        const linkedIds = [npcId, characterId, monsterId].filter((value) => value !== undefined && value !== null && value !== "");
        if (linkedIds.length > 1) {
          throw new Error("Only one of npcId, characterId, or monsterId may be provided.");
        }

        let source = "";
        let imageUrl = "";
        if (npcId !== undefined && npcId !== null && npcId !== "") {
          const parsedNpcId = Number(npcId);
          if (!Number.isInteger(parsedNpcId) || parsedNpcId <= 0) throw new Error("npcId must be a valid positive number.");
          const npc = await prisma.npc.findUnique({ where: { id: parsedNpcId } });
          if (!npc) throw new Error(`NPC with ID ${parsedNpcId} not found.`);
          source = "NPC";
          imageUrl = npc.imageUrl || "";
        } else if (characterId !== undefined && characterId !== null && characterId !== "") {
          const parsedCharacterId = Number(characterId);
          if (!Number.isInteger(parsedCharacterId) || parsedCharacterId <= 0) throw new Error("characterId must be a valid positive number.");
          const character = await prisma.character.findUnique({ where: { id: parsedCharacterId } });
          if (!character) throw new Error(`Character with ID ${parsedCharacterId} not found.`);
          source = "CHARACTER";
        } else if (monsterId !== undefined && monsterId !== null && monsterId !== "") {
          const parsedMonsterId = Number(monsterId);
          if (!Number.isInteger(parsedMonsterId) || parsedMonsterId <= 0) throw new Error("monsterId must be a valid positive number.");
          const monster = await prisma.monster.findUnique({ where: { id: parsedMonsterId } });
          if (!monster) throw new Error(`Monster with ID ${parsedMonsterId} not found.`);
          source = "MONSTER";
          imageUrl = monster.imageUrl || "";
        }

        const sortOrder = await prisma.encounterParticipant.count({ where: { encounterId: parsedEncounterId } });

        const participant = await prisma.encounterParticipant.create({
          data: {
            encounterId: parsedEncounterId,
            name: name.trim(),
            npcId: npcId !== undefined && npcId !== null && npcId !== "" ? Number(npcId) : null,
            characterId: characterId !== undefined && characterId !== null && characterId !== "" ? Number(characterId) : null,
            monsterId: monsterId !== undefined && monsterId !== null && monsterId !== "" ? Number(monsterId) : null,
            currentHp: currentHp ?? 1,
            maxHp: maxHp ?? 1,
            ac: ac ?? 10,
            isHidden: isHidden ?? false,
            initiative: initiative ?? 0,
            sortOrder,
            source,
            imageUrl,
            stats: JSON.stringify({
              currentHp: currentHp ?? 1,
              maxHp: maxHp ?? 1,
              ac: ac ?? 10,
              initiative: initiative ?? 0,
              isHidden: isHidden ?? false,
              source,
              npcId: npcId !== undefined && npcId !== null && npcId !== "" ? Number(npcId) : null,
              characterId: characterId !== undefined && characterId !== null && characterId !== "" ? Number(characterId) : null,
              monsterId: monsterId !== undefined && monsterId !== null && monsterId !== "" ? Number(monsterId) : null,
            }),
          },
        });

        const parsed = {
          ...participant,
          stats: parseJsonObject(participant.stats),
        };

        return {
          content: [{ type: "text", text: `Encounter participant created successfully:\n${JSON.stringify(parsed, null, 2)}` }],
        };
      }

      case "update_encounter_participant": {
        const { id, name, currentHp, maxHp, ac, isHidden, initiative } = args;

        const participantId = Number(id);
        if (!Number.isInteger(participantId) || participantId <= 0) {
          throw new Error("Participant id must be a valid positive number.");
        }

        const existing = await prisma.encounterParticipant.findUnique({
          where: { id: participantId },
          include: { token: true, npc: true, character: true, monster: true },
        });
        if (!existing) {
          throw new Error(`Encounter participant with ID ${participantId} not found.`);
        }

        const dataUpdate = {};
        if (name !== undefined) {
          if (!String(name || "").trim()) {
            throw new Error("Participant name must be a non-empty string.");
          }
          dataUpdate.name = String(name).trim();
        }
        if (currentHp !== undefined) dataUpdate.currentHp = currentHp;
        if (maxHp !== undefined) dataUpdate.maxHp = maxHp;
        if (ac !== undefined) dataUpdate.ac = ac;
        if (isHidden !== undefined) dataUpdate.isHidden = isHidden;
        if (initiative !== undefined) dataUpdate.initiative = initiative;

        if (Object.keys(dataUpdate).length === 0) {
          throw new Error("No valid participant fields provided to update.");
        }

        const stats = parseJsonObject(existing.stats);
        if (currentHp !== undefined) stats.currentHp = currentHp;
        if (maxHp !== undefined) stats.maxHp = maxHp;
        if (ac !== undefined) stats.ac = ac;
        if (isHidden !== undefined) stats.isHidden = isHidden;
        if (initiative !== undefined) stats.initiative = initiative;
        dataUpdate.stats = JSON.stringify(stats);

        const updated = await prisma.encounterParticipant.update({
          where: { id: participantId },
          data: dataUpdate,
        });

        if (currentHp !== undefined) {
          if (existing.npcId) {
            await prisma.npc.update({ where: { id: existing.npcId }, data: { hp: currentHp } }).catch(() => null);
          }
          if (existing.characterId) {
            await prisma.character.update({ where: { id: existing.characterId }, data: { hp: currentHp } }).catch(() => null);
          }
          if (existing.monsterId) {
            await prisma.monster.update({ where: { id: existing.monsterId }, data: { hp: currentHp } }).catch(() => null);
          }
          if (existing.tokenId) {
            const tokenStats = parseJsonObject(existing.token?.stats);
            await prisma.token.update({
              where: { id: existing.tokenId },
              data: {
                stats: JSON.stringify({
                  ...tokenStats,
                  currentHp: currentHp,
                  maxHp: maxHp ?? updated.maxHp,
                  ac: ac ?? updated.ac,
                }),
              },
            }).catch(() => null);
          }
        }

        const parsed = {
          ...updated,
          stats: parseJsonObject(updated.stats),
        };

        return {
          content: [{ type: "text", text: `Encounter participant updated successfully:\n${JSON.stringify(parsed, null, 2)}` }],
        };
      }

      //  SESSION HANDLERS
      case "list_sessions": {
        const filter = {};
        if (args.status !== undefined) {
          const status = String(args.status).toUpperCase();
          if (!VALID_SESSION_STATUSES.has(status)) {
            throw new Error("Session status must be PLANNED, ACTIVE, or COMPLETE.");
          }
          filter.status = status;
        }

        const sessions = await prisma.gameSession.findMany({
          where: filter,
          orderBy: [
            { sessionNumber: "asc" },
            { scheduledFor: "asc" },
            { createdAt: "desc" },
          ],
        });

        const parsed = sessions.map((session) => ({
          ...session,
          prepChecklist: parseJsonArray(session.prepChecklist),
          linkedWikiIds: parseJsonArray(session.linkedWikiIds),
          linkedMapIds: parseJsonArray(session.linkedMapIds),
          linkedEncounterIds: parseJsonArray(session.linkedEncounterIds),
        }));

        return {
          content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        };
      }

      case "create_session": {
        const {
          title,
          sessionNumber,
          status,
          scheduledFor,
          agenda,
          recap,
          isVisibleToPlayers,
        } = args;

        if (!title || typeof title !== "string" || !title.trim()) {
          throw new Error("Session title is required.");
        }

        const nextStatus = status ? String(status).toUpperCase() : "PLANNED";
        if (!VALID_SESSION_STATUSES.has(nextStatus)) {
          throw new Error("Session status must be PLANNED, ACTIVE, or COMPLETE.");
        }

        const data = {
          title: title.trim(),
          status: nextStatus,
          prepChecklist: JSON.stringify([]),
          linkedWikiIds: JSON.stringify([]),
          linkedMapIds: JSON.stringify([]),
          linkedEncounterIds: JSON.stringify([]),
        };

        if (sessionNumber !== undefined && sessionNumber !== null && sessionNumber !== "") {
          const parsedNumber = Number(sessionNumber);
          if (!Number.isInteger(parsedNumber) || parsedNumber <= 0) {
            throw new Error("sessionNumber must be a positive integer.");
          }
          data.sessionNumber = parsedNumber;
        }

        if (scheduledFor !== undefined && scheduledFor !== null && scheduledFor !== "") {
          const parsedDate = new Date(scheduledFor);
          if (Number.isNaN(parsedDate.getTime())) {
            throw new Error("scheduledFor must be a valid ISO date string.");
          }
          data.scheduledFor = parsedDate;
        }

        if (agenda !== undefined) data.agenda = String(agenda || "");
        if (recap !== undefined) data.recap = String(recap || "");
        if (isVisibleToPlayers !== undefined) data.isVisibleToPlayers = isVisibleToPlayers === true;

        const session = await prisma.gameSession.create({ data });

        const parsed = {
          ...session,
          prepChecklist: parseJsonArray(session.prepChecklist),
          linkedWikiIds: parseJsonArray(session.linkedWikiIds),
          linkedMapIds: parseJsonArray(session.linkedMapIds),
          linkedEncounterIds: parseJsonArray(session.linkedEncounterIds),
        };

        return {
          content: [{ type: "text", text: `Session created successfully:\n${JSON.stringify(parsed, null, 2)}` }],
        };
      }

      case "update_session": {
        const {
          id,
          title,
          sessionNumber,
          status,
          scheduledFor,
          agenda,
          recap,
          isVisibleToPlayers,
          prepChecklist,
          linkedWikiIds,
          linkedMapIds,
          linkedEncounterIds,
        } = args;

        const sessionId = Number(id);
        if (!Number.isInteger(sessionId) || sessionId <= 0) {
          throw new Error("Session id must be a valid positive number.");
        }

        const existing = await prisma.gameSession.findUnique({ where: { id: sessionId } });
        if (!existing) {
          throw new Error(`Session with ID ${sessionId} not found.`);
        }

        const data = {};

        if (title !== undefined) {
          if (!String(title || "").trim()) {
            throw new Error("title must be a non-empty string.");
          }
          data.title = String(title).trim();
        }

        if (sessionNumber !== undefined) {
          const parsedNumber = Number(sessionNumber);
          if (!Number.isInteger(parsedNumber) || parsedNumber <= 0) {
            throw new Error("sessionNumber must be a positive integer.");
          }
          data.sessionNumber = parsedNumber;
        }

        if (status !== undefined) {
          const nextStatus = String(status).toUpperCase();
          if (!VALID_SESSION_STATUSES.has(nextStatus)) {
            throw new Error("Session status must be PLANNED, ACTIVE, or COMPLETE.");
          }
          data.status = nextStatus;
        }

        if (scheduledFor !== undefined) {
          if (scheduledFor === null || scheduledFor === "") {
            data.scheduledFor = null;
          } else {
            const parsedDate = new Date(scheduledFor);
            if (Number.isNaN(parsedDate.getTime())) {
              throw new Error("scheduledFor must be a valid ISO date string.");
            }
            data.scheduledFor = parsedDate;
          }
        }

        if (agenda !== undefined) data.agenda = String(agenda || "");
        if (recap !== undefined) data.recap = String(recap || "");
        if (isVisibleToPlayers !== undefined) data.isVisibleToPlayers = isVisibleToPlayers === true;

        if (prepChecklist !== undefined) {
          data.prepChecklist = toJsonArrayString(prepChecklist, "prepChecklist", []);
        }

        if (linkedWikiIds !== undefined) {
          data.linkedWikiIds = toJsonArrayString(linkedWikiIds, "linkedWikiIds", []);
        }
        if (linkedMapIds !== undefined) {
          data.linkedMapIds = toJsonArrayString(linkedMapIds, "linkedMapIds", []);
        }
        if (linkedEncounterIds !== undefined) {
          data.linkedEncounterIds = toJsonArrayString(linkedEncounterIds, "linkedEncounterIds", []);
        }

        if (Object.keys(data).length === 0) {
          throw new Error("No valid session fields provided to update.");
        }

        if (data.status === "ACTIVE") {
          await prisma.gameSession.updateMany({
            where: { status: "ACTIVE", id: { not: sessionId } },
            data: { status: "COMPLETE" },
          });
        }

        const session = await prisma.gameSession.update({
          where: { id: sessionId },
          data,
        });

        const parsed = {
          ...session,
          prepChecklist: parseJsonArray(session.prepChecklist),
          linkedWikiIds: parseJsonArray(session.linkedWikiIds),
          linkedMapIds: parseJsonArray(session.linkedMapIds),
          linkedEncounterIds: parseJsonArray(session.linkedEncounterIds),
        };

        return {
          content: [{ type: "text", text: `Session updated successfully:\n${JSON.stringify(parsed, null, 2)}` }],
        };
      }

      //  ITEM EQUIP HANDLERS
      case "add_item_to_character": {
        const { characterId, name: itemName, quantity, weight } = args;

        const character = await prisma.character.findUnique({ where: { id: characterId } });
        if (!character) {
          throw new Error(`Character with ID ${characterId} not found.`);
        }

        let inv = [];
        try {
          inv = JSON.parse(character.inventory || "[]");
        } catch (e) {
          inv = [];
        }

        const existingItem = inv.find((i) => i && i.name && i.name.toLowerCase() === itemName.toLowerCase());
        const qtyToAdd = quantity ?? 1;

        if (existingItem) {
          existingItem.quantity = (existingItem.quantity || 1) + qtyToAdd;
        } else {
          inv.push({
            name: itemName,
            quantity: qtyToAdd,
            weight: weight ?? 0,
          });
        }

        const updated = await prisma.character.update({
          where: { id: characterId },
          data: { inventory: JSON.stringify(inv) },
        });

        return {
          content: [{ type: "text", text: `Item '${itemName}' successfully added to character '${character.name}'. New inventory:\n${JSON.stringify(inv, null, 2)}` }],
        };
      }

      case "add_item_to_npc": {
        const { npcId, name: itemName, quantity, weight } = args;

        const npc = await prisma.npc.findUnique({ where: { id: npcId } });
        if (!npc) {
          throw new Error(`NPC template with ID ${npcId} not found.`);
        }

        let inv = [];
        try {
          inv = JSON.parse(npc.inventory || "[]");
        } catch (e) {
          inv = [];
        }

        const existingItem = inv.find((i) => i && i.name && i.name.toLowerCase() === itemName.toLowerCase());
        const qtyToAdd = quantity ?? 1;

        if (existingItem) {
          existingItem.quantity = (existingItem.quantity || 1) + qtyToAdd;
        } else {
          inv.push({
            name: itemName,
            quantity: qtyToAdd,
            weight: weight ?? 0,
          });
        }

        const updated = await prisma.npc.update({
          where: { id: npcId },
          data: { inventory: JSON.stringify(inv) },
        });

        return {
          content: [{ type: "text", text: `Item '${itemName}' successfully added to NPC template '${npc.name}'. New inventory:\n${JSON.stringify(inv, null, 2)}` }],
        };
      }

      //  D&D REFERENCE HANDLERS
      case "search_reference": {
        const { category, query, limit } = args;
        const maxResults = limit ? Math.min(100, Math.max(1, limit)) : 10;

        // Fetch allowed sources from AppSettings
        const allowedSetting = await prisma.appSetting.findUnique({ where: { key: "reference.allowedSources" } });
        let allowedSources = [];
        if (allowedSetting?.value) {
          try {
            allowedSources = JSON.parse(allowedSetting.value);
          } catch (e) {}
        }

        const results = referenceSearch.search(category, query, maxResults, { sources: allowedSources });
        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        };
      }

      case "get_reference_detail": {
        const { category, name: refName, source } = args;

        const allowedSetting = await prisma.appSetting.findUnique({ where: { key: "reference.allowedSources" } });
        let allowedSources = [];
        if (allowedSetting?.value) {
          try {
            allowedSources = JSON.parse(allowedSetting.value);
          } catch (e) {}
        }

        const item = referenceSearch.getByName(category, refName, source || "", { sources: allowedSources });
        if (!item) {
          throw new Error(`D&D Reference entry not found for name '${refName}' in category '${category}'.`);
        }

        // For monsters, get fluff too if available
        if (category === "monsters") {
          const fluff = referenceSearch.getMonsterFluffByName(refName, source || "", { sources: allowedSources });
          if (fluff) {
            item.infoEntries = fluff.entries;
            item.infoName = fluff.name;
          }
        }

        return {
          content: [{ type: "text", text: JSON.stringify(item, null, 2) }],
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
