// =============================================================================
// Tablecast  DMG Treasure Tables Reference Data
// Based on D&D 5e Dungeon Master's Guide, Chapter 7: Treasure
// =============================================================================
"use strict";

/**
 * Individual Treasure tables per CR tier.
 * Returns coin amounts based on a d100 roll.
 * Format: { min, max, coinType, amountPerRoll } where amountPerRoll is an array
 * of [minResult, maxResult, amount, coin] entries.
 */
const INDIVIDUAL_TREASURE = {
  "0-4": [
    { range: [1, 30],  cp: "5d6",  sp: "0",    gp: "0",    pp: "0" },
    { range: [31, 60], cp: "0",    sp: "4d6",  gp: "0",    pp: "0" },
    { range: [61, 70], cp: "0",    sp: "0",    gp: "2d6",  pp: "0" },
    { range: [71, 95], cp: "0",    sp: "0",    gp: "2d6",  pp: "0" },
    { range: [96, 100], cp: "0",   sp: "0",    gp: "0",    pp: "1d6" },
  ],
  "5-10": [
    { range: [1, 30],  cp: "4d6x100", sp: "1d6x10", gp: "2d6",   pp: "0" },
    { range: [31, 60], cp: "0",       sp: "1d6x100", gp: "1d6x10", pp: "0" },
    { range: [61, 70], cp: "0",       sp: "0",       gp: "2d6x10", pp: "1d6" },
    { range: [71, 95], cp: "0",       sp: "0",       gp: "2d6x10", pp: "1d6" },
    { range: [96, 100], cp: "0",      sp: "0",       gp: "0",      pp: "3d6" },
  ],
  "11-16": [
    { range: [1, 20],  cp: "4d6x100",  sp: "1d6x100", gp: "1d6x100", pp: "0" },
    { range: [21, 45], cp: "0",        sp: "0",       gp: "2d6x100", pp: "1d6x10" },
    { range: [46, 75], cp: "0",        sp: "0",       gp: "2d6x100", pp: "1d6x10" },
    { range: [76, 95], cp: "0",        sp: "0",       gp: "0",       pp: "4d6x10" },
    { range: [96, 100], cp: "0",       sp: "0",       gp: "0",       pp: "6d6x10" },
  ],
  "17+": [
    { range: [1, 15],  cp: "0", sp: "0", gp: "2d6x1000", pp: "8d6x10" },
    { range: [16, 55], cp: "0", sp: "0", gp: "2d6x1000", pp: "8d6x10" },
    { range: [56, 85], cp: "0", sp: "0", gp: "0",        pp: "2d6x1000" },
    { range: [86, 100], cp: "0", sp: "0", gp: "0",       pp: "2d6x1000" },
  ],
};

/**
 * Hoard Treasure tables per CR tier.
 */
const HOARD_TREASURE = {
  "0-4": {
    coins: [
      { range: [1, 100], cp: "6d6x100", sp: "3d6x100", gp: "2d6x10", pp: "0" },
    ],
    gemsOrArt: [
      { range: [1, 6],   count: "0", type: "none" },
      { range: [7, 100], count: "2d4", type: "gem", valuePer: "10 gp" },
    ],
    magicItemChance: 0.02, // 2% chance
    magicItemTable: "A",
  },
  "5-10": {
    coins: [
      { range: [1, 100], cp: "0", sp: "2d6x1000", gp: "6d6x100", pp: "3d6x10" },
    ],
    gemsOrArt: [
      { range: [1, 3],   count: "0", type: "none" },
      { range: [4, 6],   count: "1d6", type: "gem", valuePer: "10 gp" },
      { range: [7, 9],   count: "1d6", type: "art", valuePer: "25 gp" },
      { range: [10, 12], count: "1d6", type: "gem", valuePer: "50 gp" },
      { range: [13, 15], count: "1d6", type: "gem", valuePer: "10 gp" },
      { range: [16, 19], count: "1d6", type: "art", valuePer: "25 gp" },
      { range: [20, 22], count: "1d6", type: "art", valuePer: "250 gp" },
      { range: [23, 25], count: "1d4", type: "gem", valuePer: "500 gp" },
      { range: [26, 100], count: "0", type: "none" },
    ],
    magicItemChance: 0.1, // 10%
    magicItemRolls: "1d4",
    magicItemTable: "B",
    extraMagicItemTable: "C",
    extraMagicItemChance: 0.1,
  },
  "11-16": {
    coins: [
      { range: [1, 100], cp: "0", sp: "0", gp: "4d6x1000", pp: "5d6x100" },
    ],
    gemsOrArt: [
      { range: [1, 3],    count: "0", type: "none" },
      { range: [4, 6],    count: "1d8", type: "gem", valuePer: "10 gp" },
      { range: [7, 9],    count: "1d8", type: "art", valuePer: "25 gp" },
      { range: [10, 12],  count: "1d6", type: "gem", valuePer: "50 gp" },
      { range: [13, 15],  count: "1d8", type: "gem", valuePer: "10 gp" },
      { range: [16, 19],  count: "1d6", type: "art", valuePer: "25 gp" },
      { range: [20, 23],  count: "1d6", type: "art", valuePer: "250 gp" },
      { range: [24, 26],  count: "1d4", type: "gem", valuePer: "500 gp" },
      { range: [27, 100], count: "0", type: "none" },
    ],
    magicItemChance: 0.15,
    magicItemRolls: "1d4",
    magicItemTable: "D",
    extraMagicItemTable: "E",
    extraMagicItemChance: 0.15,
  },
  "17+": {
    coins: [
      { range: [1, 100], cp: "0", sp: "0", gp: "12d6x1000", pp: "8d6x1000" },
    ],
    gemsOrArt: [
      { range: [1, 3],    count: "0", type: "none" },
      { range: [4, 7],    count: "1d12", type: "art", valuePer: "250 gp" },
      { range: [8, 11],   count: "1d8", type: "gem", valuePer: "500 gp" },
      { range: [12, 15],  count: "1d8", type: "gem", valuePer: "1000 gp" },
      { range: [16, 19],  count: "1d6", type: "art", valuePer: "250 gp" },
      { range: [20, 23],  count: "1d6", type: "art", valuePer: "750 gp" },
      { range: [24, 26],  count: "1d4", type: "gem", valuePer: "5000 gp" },
      { range: [27, 100], count: "0", type: "none" },
    ],
    magicItemChance: 0.2,
    magicItemRolls: "1d4",
    magicItemTable: "G",
    extraMagicItemTable: "H",
    extraMagicItemChance: 0.2,
  },
};

/**
 * Magic Item Tables A-I.
 * Each table is a d100 lookup. Items marked with * are consumable (potions, scrolls).
 */
const MAGIC_ITEM_TABLES = {
  A: [
    { range: [1, 50],  name: "Potion of Healing",            consumable: true },
    { range: [51, 60], name: "Spell Scroll (Cantrip)",        consumable: true },
    { range: [61, 70], name: "Potion of Climbing",           consumable: true },
    { range: [71, 90], name: "Spell Scroll (1st Level)",     consumable: true },
    { range: [91, 94], name: "Spell Scroll (2nd Level)",     consumable: true },
    { range: [95, 98], name: "Potion of Greater Healing",    consumable: true },
    { range: [99, 100], name: "Bag of Holding",               consumable: false },
  ],
  B: [
    { range: [1, 15],  name: "Potion of Greater Healing",    consumable: true },
    { range: [16, 22], name: "Potion of Fire Breath",        consumable: true },
    { range: [23, 29], name: "Potion of Resistance",         consumable: true },
    { range: [30, 34], name: "Ammunition, +1",               consumable: false },
    { range: [35, 39], name: "Potion of Animal Friendship",  consumable: true },
    { range: [40, 44], name: "Potion of Hill Giant Strength", consumable: true },
    { range: [45, 49], name: "Potion of Growth",             consumable: true },
    { range: [50, 54], name: "Potion of Water Breathing",    consumable: true },
    { range: [55, 59], name: "Spell Scroll (2nd Level)",     consumable: true },
    { range: [60, 64], name: "Spell Scroll (3rd Level)",     consumable: true },
    { range: [65, 67], name: "Bag of Holding",               consumable: false },
    { range: [68, 70], name: "Keoghtom's Ointment",          consumable: true },
    { range: [71, 73], name: "Oil of Slipperiness",          consumable: true },
    { range: [74, 75], name: "Dust of Disappearance",        consumable: true },
    { range: [76, 77], name: "Dust of Dryness",              consumable: true },
    { range: [78, 79], name: "Dust of Sneezing and Choking", consumable: true },
    { range: [80, 81], name: "Elemental Gem",                consumable: true },
    { range: [82, 83], name: "Philter of Love",              consumable: true },
    { range: [84, 84], name: "Alchemy Jug",                  consumable: false },
    { range: [85, 85], name: "Cap of Water Breathing",       consumable: false },
    { range: [86, 86], name: "Cloak of the Manta Ray",       consumable: false },
    { range: [87, 87], name: "Driftglobe",                   consumable: false },
    { range: [88, 88], name: "Goggles of Night",             consumable: false },
    { range: [89, 89], name: "Helm of Comprehending Languages", consumable: false },
    { range: [90, 90], name: "Immovable Rod",                consumable: false },
    { range: [91, 91], name: "Lantern of Revealing",         consumable: false },
    { range: [92, 92], name: "Mariner's Armor",              consumable: false },
    { range: [93, 93], name: "Mithral Armor",                consumable: false },
    { range: [94, 94], name: "Potion of Poison",             consumable: true },
    { range: [95, 95], name: "Ring of Swimming",             consumable: false },
    { range: [96, 96], name: "Robe of Useful Items",         consumable: false },
    { range: [97, 97], name: "Rope of Climbing",             consumable: false },
    { range: [98, 98], name: "Saddle of the Cavalier",       consumable: false },
    { range: [99, 100], name: "Wand of Magic Detection",     consumable: false },
  ],
  C: [
    { range: [1, 15],  name: "Potion of Superior Healing",   consumable: true },
    { range: [16, 22], name: "Spell Scroll (4th Level)",     consumable: true },
    { range: [23, 27], name: "Ammunition, +2",               consumable: false },
    { range: [28, 32], name: "Potion of Invisibility",       consumable: true },
    { range: [33, 37], name: "Potion of Speed",              consumable: true },
    { range: [38, 42], name: "Spell Scroll (5th Level)",     consumable: true },
    { range: [43, 46], name: "Spell Scroll (6th Level)",     consumable: true },
    { range: [47, 49], name: "Spell Scroll (7th Level)",     consumable: true },
    { range: [50, 51], name: "Ammunition, +3",               consumable: false },
    { range: [52, 52], name: "Oil of Etherealness",          consumable: true },
    { range: [53, 54], name: "Potion of Flying",             consumable: true },
    { range: [55, 55], name: "Potion of Clairvoyance",       consumable: true },
    { range: [56, 56], name: "Potion of Diminution",         consumable: true },
    { range: [57, 57], name: "Potion of Gaseous Form",       consumable: true },
    { range: [58, 58], name: "Potion of Giant Strength (Fire)", consumable: true },
    { range: [59, 59], name: "Potion of Giant Strength (Frost)", consumable: true },
    { range: [60, 60], name: "Potion of Giant Strength (Stone)", consumable: true },
    { range: [61, 61], name: "Potion of Heroism",            consumable: true },
    { range: [62, 62], name: "Potion of Longevity",          consumable: true },
    { range: [63, 63], name: "Potion of Mind Reading",       consumable: true },
    { range: [64, 64], name: "Potion of Poison Resistance",  consumable: true },
    { range: [65, 65], name: "Potion of Vitality",           consumable: true },
    { range: [66, 68], name: "Arrow of Slaying",             consumable: true },
    { range: [69, 70], name: "Bead of Force",                consumable: true },
    { range: [71, 72], name: "Chime of Opening",             consumable: true },
    { range: [73, 74], name: "Decanter of Endless Water",    consumable: false },
    { range: [75, 76], name: "Eyes of Minute Seeing",        consumable: false },
    { range: [77, 78], name: "Folding Boat",                 consumable: false },
    { range: [79, 79], name: "Heward's Handy Haversack",     consumable: false },
    { range: [80, 81], name: "Horseshoes of Speed",          consumable: false },
    { range: [82, 82], name: "Necklace of Fireballs",        consumable: true },
    { range: [83, 83], name: "Periapt of Health",            consumable: false },
    { range: [84, 84], name: "Periapt of Proof against Poison", consumable: false },
    { range: [85, 85], name: "Quaal's Feather Token",        consumable: true },
    { range: [86, 87], name: "Quiver of Ehlonna",            consumable: false },
    { range: [88, 89], name: "Ring of Jumping",              consumable: false },
    { range: [90, 91], name: "Ring of Mind Shielding",       consumable: false },
    { range: [92, 92], name: "Slippers of Spider Climbing",  consumable: false },
    { range: [93, 93], name: "Stone of Good Luck (Luckstone)", consumable: false },
    { range: [94, 94], name: "Trident of Fish Command",      consumable: false },
    { range: [95, 95], name: "Wand of Magic Missiles",       consumable: false },
    { range: [96, 97], name: "Wand of Secrets",              consumable: false },
    { range: [98, 98], name: "Wand of Web",                  consumable: false },
    { range: [99, 100], name: "Wind Fan",                    consumable: false },
  ],
  D: [
    { range: [1, 20],  name: "Potion of Supreme Healing",    consumable: true },
    { range: [21, 25], name: "Potion of Invisibility",       consumable: true },
    { range: [26, 30], name: "Potion of Speed",              consumable: true },
    { range: [31, 35], name: "Spell Scroll (6th Level)",     consumable: true },
    { range: [36, 40], name: "Spell Scroll (7th Level)",     consumable: true },
    { range: [41, 45], name: "Ammunition, +3",               consumable: false },
    { range: [46, 50], name: "Oil of Etherealness",          consumable: true },
    { range: [51, 55], name: "Potion of Flying",             consumable: true },
    { range: [56, 60], name: "Potion of Giant Strength (Cloud)", consumable: true },
    { range: [61, 65], name: "Potion of Giant Strength (Storm)", consumable: true },
    { range: [66, 68], name: "Potion of Growth",             consumable: true },
    { range: [69, 70], name: "Potion of Heroism",            consumable: true },
    { range: [71, 72], name: "Potion of Vitality",           consumable: true },
    { range: [73, 74], name: "Spell Scroll (8th Level)",     consumable: true },
    { range: [75, 76], name: "Horseshoes of a Zephyr",       consumable: false },
    { range: [77, 78], name: "Nolzur's Marvelous Pigments",  consumable: true },
    { range: [79, 80], name: "Bag of Beans",                 consumable: false },
    { range: [81, 82], name: "Bead of Force",                consumable: true },
    { range: [83, 84], name: "Chime of Opening",             consumable: true },
    { range: [85, 86], name: "Folding Boat",                 consumable: false },
    { range: [87, 88], name: "Portable Hole",                consumable: false },
    { range: [89, 90], name: "Boots of Levitation",          consumable: false },
    { range: [91, 92], name: "Boots of Speed",               consumable: false },
    { range: [93, 94], name: "Cape of the Mountebank",       consumable: false },
    { range: [95, 95], name: "Cloak of the Bat",             consumable: false },
    { range: [96, 97], name: "Ioun Stone (Protection)",      consumable: false },
    { range: [98, 98], name: "Portable Hole",                consumable: false },
    { range: [99, 99], name: "Ring of Telekinesis",          consumable: false },
    { range: [100, 100], name: "Robe of Eyes",               consumable: false },
  ],
  E: [
    { range: [1, 30],  name: "Spell Scroll (8th Level)",     consumable: true },
    { range: [31, 55], name: "Potion of Storm Giant Strength", consumable: true },
    { range: [56, 70], name: "Potion of Supreme Healing",    consumable: true },
    { range: [71, 85], name: "Spell Scroll (9th Level)",     consumable: true },
    { range: [86, 93], name: "Universal Solvent",            consumable: true },
    { range: [94, 94], name: "Arrow of Slaying",             consumable: true },
    { range: [95, 95], name: "Sovereign Glue",               consumable: true },
    { range: [96, 96], name: "Wand of Secrets",              consumable: false },
    { range: [97, 97], name: "Spell Scroll (Cantrip)",       consumable: true },
    { range: [98, 98], name: "Spell Scroll (1st Level)",     consumable: true },
    { range: [99, 99], name: "Spell Scroll (2nd Level)",     consumable: true },
    { range: [100, 100], name: "Spell Scroll (3rd Level)",   consumable: true },
  ],
  F: [
    { range: [1, 15],  name: "Potion of Healing",            consumable: true },
    { range: [16, 25], name: "Bag of Holding",               consumable: false },
    { range: [26, 30], name: "Cap of Water Breathing",       consumable: false },
    { range: [31, 35], name: "Cloak of the Manta Ray",       consumable: false },
    { range: [36, 40], name: "Driftglobe",                   consumable: false },
    { range: [41, 45], name: "Goggles of Night",             consumable: false },
    { range: [46, 50], name: "Helm of Comprehending Languages", consumable: false },
    { range: [51, 55], name: "Immovable Rod",                consumable: false },
    { range: [56, 60], name: "Lantern of Revealing",         consumable: false },
    { range: [61, 65], name: "Mariner's Armor",              consumable: false },
    { range: [66, 70], name: "Mithral Armor",                consumable: false },
    { range: [71, 75], name: "Potion of Poison",             consumable: true },
    { range: [76, 80], name: "Ring of Swimming",             consumable: false },
    { range: [81, 85], name: "Robe of Useful Items",         consumable: false },
    { range: [86, 90], name: "Rope of Climbing",             consumable: false },
    { range: [91, 95], name: "Saddle of the Cavalier",       consumable: false },
    { range: [96, 100], name: "Wand of Magic Detection",     consumable: false },
  ],
  G: [
    { range: [1, 5],   name: "Weapon, +2",                   consumable: false },
    { range: [6, 10],  name: "Spell Scroll (7th Level)",     consumable: true },
    { range: [11, 15], name: "Spell Scroll (8th Level)",     consumable: true },
    { range: [16, 20], name: "Potion of Giant Strength (Storm)", consumable: true },
    { range: [21, 25], name: "Potion of Supreme Healing",    consumable: true },
    { range: [26, 30], name: "Spell Scroll (9th Level)",     consumable: true },
    { range: [31, 35], name: "Universal Solvent",            consumable: true },
    { range: [36, 40], name: "Arrow of Slaying",             consumable: false },
    { range: [41, 45], name: "Sovereign Glue",               consumable: true },
    { range: [46, 50], name: "Wand of Fireballs",            consumable: false },
    { range: [51, 55], name: "Wand of Lightning Bolts",      consumable: false },
    { range: [56, 60], name: "Wand of Wonder",               consumable: false },
    { range: [61, 65], name: "Cloak of Arachnida",           consumable: false },
    { range: [66, 70], name: "Cloak of Displacement",        consumable: false },
    { range: [71, 75], name: "Ioun Stone (Agility)",         consumable: false },
    { range: [76, 78], name: "Ioun Stone (Awareness)",       consumable: false },
    { range: [79, 81], name: "Ioun Stone (Fortitude)",       consumable: false },
    { range: [82, 84], name: "Ioun Stone (Intellect)",       consumable: false },
    { range: [85, 87], name: "Ioun Stone (Leadership)",      consumable: false },
    { range: [88, 90], name: "Ioun Stone (Strength)",        consumable: false },
    { range: [91, 93], name: "Manual of Bodily Health",      consumable: true },
    { range: [94, 96], name: "Manual of Gainful Exercise",   consumable: true },
    { range: [97, 97], name: "Manual of Quickness of Action", consumable: true },
    { range: [98, 98], name: "Tome of Clear Thought",        consumable: true },
    { range: [99, 99], name: "Tome of Leadership and Influence", consumable: true },
    { range: [100, 100], name: "Tome of Understanding",      consumable: true },
  ],
  H: [
    { range: [1, 10],  name: "Weapon, +3",                   consumable: false },
    { range: [11, 15], name: "Amulet of Health",             consumable: false },
    { range: [16, 20], name: "Armor, +1 (Scale Mail)",       consumable: false },
    { range: [21, 25], name: "Armor, +1 (Chain Mail)",       consumable: false },
    { range: [26, 30], name: "Armor, +2 (Leather)",          consumable: false },
    { range: [31, 35], name: "Armor, +2 (Studded Leather)",  consumable: false },
    { range: [36, 40], name: "Armor, +2 (Half Plate)",       consumable: false },
    { range: [41, 45], name: "Armor, +2 (Plate)",            consumable: false },
    { range: [46, 50], name: "Armor, +3 (Studded Leather)",  consumable: false },
    { range: [51, 55], name: "Armor, +3 (Half Plate)",       consumable: false },
    { range: [56, 60], name: "Armor, +3 (Plate)",            consumable: false },
    { range: [61, 65], name: "Belt of Giant Strength (Fire)", consumable: false },
    { range: [66, 70], name: "Belt of Giant Strength (Cloud)", consumable: false },
    { range: [71, 75], name: "Belt of Giant Strength (Storm)", consumable: false },
    { range: [76, 80], name: "Boots of Speed",               consumable: false },
    { range: [81, 85], name: "Boots of the Winterlands",     consumable: false },
    { range: [86, 90], name: "Cloak of Invisibility",        consumable: false },
    { range: [91, 93], name: "Dragon Scale Mail",            consumable: false },
    { range: [94, 96], name: "Dragon Slayer",                consumable: false },
    { range: [97, 98], name: "Efreeti Chain",                consumable: false },
    { range: [99, 100], name: "Flame Tongue",                consumable: false },
  ],
  I: [
    { range: [1, 5],   name: "Defender",                     consumable: false },
    { range: [6, 10],  name: "Hammer of Thunderbolts",       consumable: false },
    { range: [11, 15], name: "Luck Blade",                   consumable: false },
    { range: [16, 20], name: "Sword of Answering",           consumable: false },
    { range: [21, 23], name: "Holy Avenger",                 consumable: false },
    { range: [24, 26], name: "Ring of Djinni Summoning",     consumable: false },
    { range: [27, 29], name: "Ring of Elemental Command",    consumable: false },
    { range: [30, 32], name: "Ring of Spell Turning",        consumable: false },
    { range: [33, 35], name: "Robe of the Archmagi",         consumable: false },
    { range: [36, 38], name: "Scroll of Tarrasque Summoning", consumable: true },
    { range: [39, 41], name: "Sovereign Glue",               consumable: true },
    { range: [42, 44], name: "Sphere of Annihilation",       consumable: false },
    { range: [45, 47], name: "Staff of the Magi",            consumable: false },
    { range: [48, 50], name: "Staff of Power",               consumable: false },
    { range: [51, 53], name: "Talisman of Pure Good",        consumable: false },
    { range: [54, 56], name: "Talisman of the Sphere",       consumable: false },
    { range: [57, 59], name: "Talisman of Ultimate Evil",    consumable: false },
    { range: [60, 62], name: "Tome of the Stilled Tongue",   consumable: false },
    { range: [63, 65], name: "Armor, +3 (Plate)",            consumable: false },
    { range: [66, 68], name: "Armor, +3 (Chain Mail)",       consumable: false },
    { range: [69, 71], name: "Armor, +3 (Half Plate)",       consumable: false },
    { range: [72, 74], name: "Armor, +3 (Studded Leather)",  consumable: false },
    { range: [75, 77], name: "Amulet of the Planes",         consumable: false },
    { range: [78, 80], name: "Belt of Giant Strength (Storm)", consumable: false },
    { range: [81, 83], name: "Boots of Speed",               consumable: false },
    { range: [84, 86], name: "Cloak of Invisibility",        consumable: false },
    { range: [87, 89], name: "Crystal Ball (Legendary)",     consumable: false },
    { range: [90, 92], name: "Ioun Stone (Greater Absorption)", consumable: false },
    { range: [93, 95], name: "Ioun Stone (Mastery)",         consumable: false },
    { range: [96, 98], name: "Ioun Stone (Regeneration)",    consumable: false },
    { range: [99, 100], name: "Plate Armor of Etherealness", consumable: false },
  ],
};

/**
 * Gemstone types by value tier.
 */
const GEM_TYPES = {
  "10 gp":  ["Azurite", "Banded agate", "Blue quartz", "Eye agate", "Hematite", "Lapis lazuli", "Malachite", "Moss agate", "Obsidian", "Rhodochrosite", "Tiger eye", "Turquoise"],
  "50 gp":  ["Bloodstone", "Carnelian", "Chalcedony", "Chrysoprase", "Citrine", "Jasper", "Moonstone", "Onyx", "Quartz", "Sardonyx", "Star rose quartz", "Zircon"],
  "100 gp": ["Amber", "Amethyst", "Chrysoberyl", "Coral", "Garnet", "Jade", "Jet", "Pearl", "Spinel", "Tourmaline"],
  "500 gp": ["Alexandrite", "Aquamarine", "Black pearl", "Blue spinel", "Peridot", "Topaz"],
  "1000 gp": ["Black opal", "Blue sapphire", "Emerald", "Fire opal", "Opal", "Star ruby", "Star sapphire", "Yellow sapphire"],
  "5000 gp": ["Black sapphire", "Diamond", "Jade (fine)", "Ruby", "Sapphire"],
};

/**
 * Art object types by value tier.
 */
const ART_TYPES = {
  "25 gp":  ["Silver ewer", "Carved bone statuette", "Small gold bracelet", "Cloth-of-gold vestments", "Black velvet mask with citrines", "Copper chalice with silver filigree"],
  "250 gp": ["Gold ring set with bloodstones", "Carved ivory statuette", "Bejeweled gold bracelet", "Silver-plated longsword with jet set in hilt", "Embroidery silk and velvet mantle", "Engraved gold locket with a painted portrait inside"],
  "750 gp": ["Gold goblet set with emeralds", "Gold jewelry box with platinum filigree", "Painted gold silk vestments", "Carved ivory harp", "Gold circlet set with four aquamarines", "Dragon's tooth set in platinum chain"],
  "2500 gp": ["Fine gold chain set with fire opals", "Old masterpiece painting", "Embroidered silk and velvet cloak set with electrum moons", "Platinum bracelet set with topaz", "Gilded imperial dragon throne"],
  "7500 gp": ["Jeweled platinum crown", "Gold and ruby ring", "Gold cup set with emeralds", "Silk and velvet cloak set with sapphires", "Scepter set with diamonds"],
};

// ---------------------------------------------------------------------------
// Dice rolling helpers
// ---------------------------------------------------------------------------

/**
 * Roll dice notation like "3d6" or "2d6x100".
 * Returns the numeric result.
 */
function rollDice(notation) {
  if (!notation || notation === "0") return 0;

  // Handle plain integer strings (e.g., "1", "5")
  const plainNum = parseInt(notation, 10);
  if (!isNaN(plainNum) && String(plainNum) === String(notation)) {
    return plainNum;
  }

  // Handle "x" notation (e.g., "4d6x100")
  const multMatch = notation.match(/^(\d+)d(\d+)x(\d+)$/);
  if (multMatch) {
    const [, count, sides, multiplier] = multMatch;
    let total = 0;
    for (let i = 0; i < parseInt(count, 10); i++) {
      total += Math.floor(Math.random() * parseInt(sides, 10)) + 1;
    }
    return total * parseInt(multiplier, 10);
  }

  // Handle standard "NdM" notation
  const match = notation.match(/^(\d+)d(\d+)$/);
  if (match) {
    const [, count, sides] = match;
    let total = 0;
    for (let i = 0; i < parseInt(count, 10); i++) {
      total += Math.floor(Math.random() * parseInt(sides, 10)) + 1;
    }
    return total;
  }

  return 0;
}

/**
 * Roll a d100 (1-100).
 */
function rollD100() {
  return Math.floor(Math.random() * 100) + 1;
}

/**
 * Roll a dX (1-X).
 */
function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

/**
 * Find the matching entry in a d100 table based on a roll.
 */
function lookupTable(roll, tableEntries) {
  for (const entry of tableEntries) {
    const [min, max] = entry.range;
    if (roll >= min && roll <= max) {
      return entry;
    }
  }
  return tableEntries[tableEntries.length - 1];
}

/**
 * Get the appropriate CR tier label for a given CR value.
 */
function getCrTier(cr) {
  if (cr === undefined || cr === null) return "0-4";
  const num = typeof cr === "string" ? parseFloat(cr) : cr;
  if (num <= 4) return "0-4";
  if (num <= 10) return "5-10";
  if (num <= 16) return "11-16";
  return "17+";
}

/**
 * Pick a random item from an array.
 */
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate individual treasure for a given CR value.
 * @param {number|string} cr - Challenge rating (e.g., 5, "1/4")
 * @returns {{ coins: { cp: number, sp: number, gp: number, pp: number }, roll: number, tier: string }}
 */
function generateIndividualTreasure(cr) {
  const tier = getCrTier(cr);
  const table = INDIVIDUAL_TREASURE[tier];
  if (!table) return { coins: { cp: 0, sp: 0, gp: 0, pp: 0 }, roll: 0, tier };

  const roll = rollD100();
  const entry = lookupTable(roll, table);

  return {
    coins: {
      cp: rollDice(entry.cp),
      sp: rollDice(entry.sp),
      gp: rollDice(entry.gp),
      pp: rollDice(entry.pp),
    },
    roll,
    tier,
  };
}

/**
 * Roll on a magic item table.
 * @param {string} tableName - "A" through "I"
 * @param {number} [countRoll] - Optional dice notation for count (e.g., "1d4")
 * @returns {{ items: Array<{ name: string, consumable: boolean, table: string }>, roll: number }}
 */
function rollMagicItems(tableName, countRoll) {
  const table = MAGIC_ITEM_TABLES[tableName];
  if (!table) return { items: [], roll: 0 };

  const count = countRoll ? rollDice(countRoll) : 1;
  const items = [];
  for (let i = 0; i < count; i++) {
    const roll = rollD100();
    const entry = lookupTable(roll, table);
    items.push({
      name: entry.name,
      consumable: entry.consumable,
      table: tableName,
    });
  }

  return { items, roll: rollD100() };
}

/**
 * Generate gems or art objects.
 * @param {string} tier - CR tier string
 * @param {string} type - "gem" or "art"
 * @param {string} countNotation - Dice notation for count
 * @param {string} valuePer - Value per item (e.g., "10 gp")
 * @returns {Array<{ name: string, value: number, type: string }>}
 */
function generateGemsOrArt(tier, type, countNotation, valuePer) {
  const count = rollDice(countNotation);
  if (count <= 0) return [];

  const valueNum = parseInt(valuePer, 10);
  const items = [];

  for (let i = 0; i < count; i++) {
    if (type === "gem") {
      const tierKey = Object.keys(GEM_TYPES).find(k => parseInt(k, 10) === valueNum) || "10 gp";
      const gemTypes = GEM_TYPES[tierKey] || GEM_TYPES["10 gp"];
      items.push({
        name: pickRandom(gemTypes),
        value: valueNum,
        type: "gem",
      });
    } else if (type === "art") {
      const tierKey = Object.keys(ART_TYPES).find(k => parseInt(k, 10) === valueNum) || "25 gp";
      const artTypes = ART_TYPES[tierKey] || ART_TYPES["25 gp"];
      items.push({
        name: pickRandom(artTypes),
        value: valueNum,
        type: "art",
      });
    }
  }

  return items;
}

/**
 * Generate hoard treasure for a given CR value.
 * @param {number|string} cr - Challenge rating
 * @returns {Object} Complete hoard treasure result
 */
function generateHoardTreasure(cr) {
  const tier = getCrTier(cr);
  const table = HOARD_TREASURE[tier];
  if (!table) return { coins: { cp: 0, sp: 0, gp: 0, pp: 0 }, gems: [], art: [], magicItems: [], tier };

  // Generate coins
  const coinEntry = table.coins[0];
  const coins = {
    cp: rollDice(coinEntry.cp),
    sp: rollDice(coinEntry.sp),
    gp: rollDice(coinEntry.gp),
    pp: rollDice(coinEntry.pp),
  };

  // Generate gems/art
  const gemsOrArt = [];
  const gaIroll = rollD100();
  const gaIEntry = lookupTable(gaIroll, table.gemsOrArt);

  if (gaIEntry && gaIEntry.type !== "none" && gaIEntry.count !== "0") {
    const items = generateGemsOrArt(tier, gaIEntry.type, gaIEntry.count, gaIEntry.valuePer);
    gemsOrArt.push(...items);
  }

  // Generate magic items
  const magicItems = [];
  if (Math.random() < table.magicItemChance) {
    const result = rollMagicItems(table.magicItemTable, table.magicItemRolls || "1");
    magicItems.push(...result.items);
  }
  if (table.extraMagicItemTable && Math.random() < (table.extraMagicItemChance || 0)) {
    const result = rollMagicItems(table.extraMagicItemTable, "1");
    magicItems.push(...result.items);
  }

  return { coins, gems: gemsOrArt.filter(i => i.type === "gem"), art: gemsOrArt.filter(i => i.type === "art"), magicItems, tier };
}

/**
 * Calculate total GP value of a treasure result.
 * @param {Object} treasure - Result from generateIndividualTreasure or generateHoardTreasure
 * @returns {number} Total value in GP
 */
function calculateTotalValue(treasure) {
  let total = 0;
  const c = treasure.coins || {};
  total += (c.pp || 0) * 10;  // 1 pp = 10 gp
  total += (c.gp || 0);
  total += (c.sp || 0) / 10;
  total += (c.cp || 0) / 100;

  const gems = treasure.gems || [];
  for (const g of gems) total += g.value || 0;

  const art = treasure.art || [];
  for (const a of art) total += a.value || 0;

  return Math.round(total * 100) / 100;
}

module.exports = {
  INDIVIDUAL_TREASURE,
  HOARD_TREASURE,
  MAGIC_ITEM_TABLES,
  GEM_TYPES,
  ART_TYPES,
  generateIndividualTreasure,
  generateHoardTreasure,
  generateGemsOrArt,
  rollMagicItems,
  calculateTotalValue,
  getCrTier,
  rollDice,
  rollD100,
};
