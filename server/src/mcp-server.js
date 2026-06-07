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
