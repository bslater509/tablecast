// =============================================================================
// Tablecast MCP Server — Tool Schema Definitions
// =============================================================================
"use strict";

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
      required: ["name"],
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
        status: { type: "string", enum: ["PLANNED", "ACTIVE", "COMPLETED"], description: "Filter by status." },
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
        status: { type: "string", enum: ["PLANNED", "ACTIVE", "COMPLETED"], description: "Session status (default: PLANNED)." },
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
        status: { type: "string", enum: ["PLANNED", "ACTIVE", "COMPLETED"] },
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

  //  SOUNDBOARD TOOLS
  {
    name: "list_soundtracks",
    description: "List all soundboard audio tracks, optionally filtered by category.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Filter by category (COMBAT, EXPLORATION, TOWN, TAVERN, DUNGEON, WILDERNESS, AMBIENT)." },
      },
    },
  },
  {
    name: "create_soundtrack",
    description: "Register a new soundboard audio track.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Track display name." },
        category: { type: "string", enum: ["COMBAT", "EXPLORATION", "TOWN", "TAVERN", "DUNGEON", "WILDERNESS", "AMBIENT"], description: "Track category (default: AMBIENT)." },
        filePath: { type: "string", description: "Relative file path under uploads/audio/." },
        duration: { type: "number", description: "Duration in seconds (default: 0)." },
        loop: { type: "boolean", description: "Whether to loop playback (default: false)." },
      },
      required: ["name", "filePath"],
    },
  },
  {
    name: "update_soundtrack",
    description: "Update an existing soundboard track's metadata.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Track ID to update." },
        name: { type: "string" },
        category: { type: "string", enum: ["COMBAT", "EXPLORATION", "TOWN", "TAVERN", "DUNGEON", "WILDERNESS", "AMBIENT"] },
        filePath: { type: "string" },
        duration: { type: "number" },
        loop: { type: "boolean" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_soundtrack",
    description: "Delete a soundboard track by ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Track ID to delete." },
      },
      required: ["id"],
    },
  },

  //  HANDOUT TOOLS
  {
    name: "list_handouts",
    description: "List all player handouts, optionally filtered by characterId.",
    inputSchema: {
      type: "object",
      properties: {
        characterId: { type: "number", description: "Filter by character ID to see handouts targeted at them." },
      },
    },
  },
  {
    name: "create_handout",
    description: "Create a new player handout (DM only).",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Handout title." },
        content: { type: "string", description: "Handout content (markdown)." },
        imageUrl: { type: "string", description: "Optional image URL." },
        targetCharacterIds: {
          type: "array",
          items: { type: "number" },
          description: "Array of character IDs to target. Empty array means all players.",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "update_handout",
    description: "Update an existing player handout.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Handout ID to update." },
        title: { type: "string" },
        content: { type: "string" },
        imageUrl: { type: "string" },
        targetCharacterIds: {
          type: "array",
          items: { type: "number" },
          description: "Array of character IDs to target.",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_handout",
    description: "Delete a player handout by ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Handout ID to delete." },
      },
      required: ["id"],
    },
  },

  //  CALENDAR & WEATHER TOOLS
  {
    name: "get_calendar",
    description: "Get the current in-game calendar config and weather.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "update_calendar",
    description: "Update calendar configuration (month names, day names, day length, date).",
    inputSchema: {
      type: "object",
      properties: {
        monthNames: { type: "array", items: { type: "string" }, description: "Array of 12 month names." },
        dayNames: { type: "array", items: { type: "string" }, description: "Array of 7 day names." },
        dayLength: { type: "string", enum: ["standard", "long", "short"], description: "Day length setting." },
        timeOfDay: { type: "string", enum: ["dawn", "morning", "afternoon", "dusk", "night"], description: "Current time of day." },
        currentDate: {
          type: "object",
          properties: {
            year: { type: "number" },
            month: { type: "number" },
            day: { type: "number" },
          },
          description: "New date to set.",
        },
      },
    },
  },
  {
    name: "advance_calendar",
    description: "Advance the in-game calendar by a number of days and optionally set time of day.",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "number", description: "Number of days to advance (0-365, default: 1)." },
        timeOfDay: { type: "string", enum: ["dawn", "morning", "afternoon", "dusk", "night"], description: "Time of day after advancement." },
      },
    },
  },
  {
    name: "generate_weather",
    description: "Generate new weather for the current calendar date and a given terrain type.",
    inputSchema: {
      type: "object",
      properties: {
        terrain: { type: "string", enum: ["desert", "forest", "mountains", "plains", "coastal", "swamp", "arctic", "urban", "underground"], description: "Terrain type (default: current terrain or plains)." },
      },
    },
  },
  {
    name: "delete_soundtrack",
    description: "Delete a soundboard track by ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Track ID to delete." },
      },
      required: ["id"],
    },
  },

  //  QUEST TOOLS
  {
    name: "list_quests",
    description: "List all quests, optionally filtered by status.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Filter by status: ACTIVE, COMPLETED, or FAILED." },
      },
    },
  },
  {
    name: "create_quest",
    description: "Create a new quest.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Quest title." },
        description: { type: "string", description: "Quest description (optional)." },
        status: { type: "string", enum: ["ACTIVE", "COMPLETED", "FAILED"], description: "Quest status (default: ACTIVE)." },
        objectives: { type: "array", items: { type: "object", properties: { description: { type: "string" }, type: { type: "string", enum: ["KILL", "FETCH", "ESCORT", "EXPLORE", "TALK", "CRAFT"] }, isComplete: { type: "boolean" }, progress: { type: "number" }, target: { type: "number" } } }, description: "Array of objective objects." },
        rewards: { type: "object", properties: { xp: { type: "number" }, gold: { type: "number" }, items: { type: "array", items: { type: "object", properties: { name: { type: "string" }, quantity: { type: "number" } } } } }, description: "Rewards object (xp, gold, items)." },
        questGiverNpcId: { type: "number", description: "NPC ID who gives this quest." },
        parentQuestId: { type: "number", description: "Parent quest ID for quest chains." },
        isVisibleToPlayers: { type: "boolean", description: "Whether players can see this quest." },
      },
      required: ["title"],
    },
  },
  {
    name: "update_quest",
    description: "Update an existing quest's fields.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Quest ID to update." },
        title: { type: "string" },
        description: { type: "string" },
        status: { type: "string", enum: ["ACTIVE", "COMPLETED", "FAILED"] },
        objectives: { type: "array", items: { type: "object", properties: { description: { type: "string" }, type: { type: "string", enum: ["KILL", "FETCH", "ESCORT", "EXPLORE", "TALK", "CRAFT"] }, isComplete: { type: "boolean" }, progress: { type: "number" }, target: { type: "number" } } } },
        rewards: { type: "object", properties: { xp: { type: "number" }, gold: { type: "number" }, items: { type: "array", items: { type: "object", properties: { name: { type: "string" }, quantity: { type: "number" } } } } } },
        questGiverNpcId: { type: "number" },
        parentQuestId: { type: "number" },
        isVisibleToPlayers: { type: "boolean" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_quest",
    description: "Delete a quest by ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Quest ID to delete." },
      },
      required: ["id"],
    },
  },
  //  HOMEBREW ENTRY TOOLS
  {
    name: "list_homebrew",
    description: "List all homebrew content entries (custom races, classes, feats, spells, magic items, monsters), optionally filtered by type.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["RACE", "CLASS", "FEAT", "SPELL", "MAGIC_ITEM", "MONSTER"], description: "Filter by entry type." },
        active: { type: "boolean", description: "Filter by active status." },
      },
    },
  },
  {
    name: "create_homebrew",
    description: "Create a new homebrew content entry (custom race, class, feat, spell, magic item, or monster).",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["RACE", "CLASS", "FEAT", "SPELL", "MAGIC_ITEM", "MONSTER"], description: "Entry type." },
        name: { type: "string", description: "Entry name." },
        source: { type: "string", description: "Source label (e.g., 'My Campaign')." },
        version: { type: "string", description: "Semver version string (default: '1.0.0')." },
        content: { type: "object", description: "JSON object with type-specific schema. See documentation for per-type schemas." },
        tags: { type: "array", items: { type: "string" }, description: "Tags for categorization." },
        isActive: { type: "boolean", description: "Whether this entry is active (default: true)." },
      },
      required: ["type", "name"],
    },
  },
  {
    name: "update_homebrew",
    description: "Update an existing homebrew content entry.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Homebrew entry ID to update." },
        type: { type: "string", enum: ["RACE", "CLASS", "FEAT", "SPELL", "MAGIC_ITEM", "MONSTER"] },
        name: { type: "string" },
        source: { type: "string" },
        version: { type: "string" },
        content: { type: "object" },
        tags: { type: "array", items: { type: "string" } },
        isActive: { type: "boolean" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_homebrew",
    description: "Delete a homebrew content entry by ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Homebrew entry ID to delete." },
      },
      required: ["id"],
    },
  },

  //  DIALOGUE TREE TOOLS
  {
    name: "get_npc_dialogue",
    description: "Get the dialogue tree for an NPC by NPC ID.",
    inputSchema: {
      type: "object",
      properties: {
        npcId: { type: "number", description: "NPC ID whose dialogue tree to fetch." },
      },
      required: ["npcId"],
    },
  },
  {
    name: "update_npc_dialogue",
    description: "Update/replace the full dialogue tree for an NPC. The tree must be a JSON object with a startNodeId and nodes array.",
    inputSchema: {
      type: "object",
      properties: {
        npcId: { type: "number", description: "NPC ID to update." },
        dialogueTree: {
          type: "object",
          description: "Dialogue tree object with startNodeId and nodes array. See documentation for node types.",
        },
      },
      required: ["npcId", "dialogueTree"],
    },
  },
  {
    name: "start_npc_dialogue",
    description: "Start a dialogue with an NPC, returning the starting node.",
    inputSchema: {
      type: "object",
      properties: {
        npcId: { type: "number", description: "NPC ID to start dialogue with." },
      },
      required: ["npcId"],
    },
  },
  {
    name: "advance_npc_dialogue",
    description: "Advance dialogue to the next node. Provide nodeId and optional choiceIndex (for CHOICE nodes), rollResult (for SKILL_CHECK/CONDITION nodes), and context (for CONDITION evaluation).",
    inputSchema: {
      type: "object",
      properties: {
        npcId: { type: "number", description: "NPC ID." },
        nodeId: { type: "string", description: "Current node ID to advance from." },
        choiceIndex: { type: "number", description: "Index of the selected choice (required for CHOICE nodes)." },
        rollResult: { type: "number", description: "Dice roll result (for SKILL_CHECK/CONDITION nodes)." },
        context: {
          type: "object",
          description: "Optional evaluation context with party, player, variables, roll.",
        },
      },
      required: ["npcId", "nodeId"],
    },
  },
  //  ENCOUNTER TEMPLATE TOOLS
  {
    name: "list_encounter_templates",
    description: "List all encounter templates, optionally filtered by difficulty.",
    inputSchema: {
      type: "object",
      properties: {
        difficulty: { type: "string", enum: ["easy", "medium", "hard", "deadly"], description: "Filter by difficulty." },
      },
    },
  },
  {
    name: "create_encounter_template",
    description: "Create a reusable encounter template.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Template name." },
        description: { type: "string", description: "Template description." },
        difficulty: { type: "string", enum: ["easy", "medium", "hard", "deadly"], description: "Difficulty rating." },
        recommendedLevel: { type: "number", description: "Recommended party level." },
        tags: { type: "array", items: { type: "string" }, description: "Array of tag strings." },
        participants: {
          type: "array",
          items: {
            type: "object",
            properties: {
              sourceType: { type: "string", enum: ["npc", "monster", "character", "placeholder"], description: "Source type." },
              sourceId: { type: "number", description: "Source entity ID (optional for placeholders)." },
              name: { type: "string", description: "Display name." },
              count: { type: "number", description: "Number of this participant." },
            },
          },
          description: "Array of participant objects.",
        },
        mapId: { type: "number", description: "Associated map ID (optional)." },
      },
      required: ["name"],
    },
  },
  {
    name: "update_encounter_template",
    description: "Update an encounter template.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Template ID to update." },
        name: { type: "string", description: "Template name." },
        description: { type: "string", description: "Template description." },
        difficulty: { type: "string", enum: ["easy", "medium", "hard", "deadly"], description: "Difficulty rating." },
        recommendedLevel: { type: "number", description: "Recommended party level." },
        tags: { type: "array", items: { type: "string" }, description: "Array of tag strings." },
        participants: {
          type: "array",
          items: {
            type: "object",
            properties: {
              sourceType: { type: "string", enum: ["npc", "monster", "character", "placeholder"], description: "Source type." },
              sourceId: { type: "number", description: "Source entity ID (optional for placeholders)." },
              name: { type: "string", description: "Display name." },
              count: { type: "number", description: "Number of this participant." },
            },
          },
          description: "Array of participant objects.",
        },
        mapId: { type: "number", description: "Associated map ID (optional)." },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_encounter_template",
    description: "Delete an encounter template by ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Template ID to delete." },
      },
      required: ["id"],
    },
  },
  {
    name: "apply_encounter_template",
    description: "Apply a template to create a live encounter.",
    inputSchema: {
      type: "object",
      properties: {
        templateId: { type: "number", description: "Template ID to apply." },
        mapId: { type: "number", description: "Override map ID (optional)." },
        name: { type: "string", description: "Encounter name override (optional)." },
      },
      required: ["templateId"],
    },
  },
];

module.exports = { TOOLS };
