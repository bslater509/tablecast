export const DICE_THEME_OPTIONS = [
  {
    id: "default",
    name: "Arcane Violet",
    shortName: "Violet",
    description: "Clean satin dice with high-contrast ivory numerals.",
    defaultColor: "#7c3aed",
    accent: "#a78bfa",
    textColor: "#ffffff",
    gradient: "linear-gradient(145deg, #7c3aed 0%, #4c1d95 58%, #20113f 100%)",
    surface: "rgba(124, 58, 237, 0.16)",
    border: "rgba(167, 139, 250, 0.45)",
    glow: "rgba(124, 58, 237, 0.42)",
    textShadow: "0 1px 2px rgba(0,0,0,0.85)",
    materialLabel: "Satin",
  },
  {
    id: "glass",
    name: "Astral Glass",
    shortName: "Glass",
    description: "Translucent crystal edges with bright engraved pips.",
    defaultColor: "#a5f3fc",
    accent: "#67e8f9",
    textColor: "#ffffff",
    gradient: "linear-gradient(145deg, rgba(207,250,254,0.38) 0%, rgba(14,116,144,0.24) 55%, rgba(15,23,42,0.56) 100%)",
    surface: "rgba(103, 232, 249, 0.12)",
    border: "rgba(207, 250, 254, 0.58)",
    glow: "rgba(103, 232, 249, 0.48)",
    textShadow: "0 0 5px rgba(255,255,255,0.72), 0 1px 2px rgba(0,0,0,0.88)",
    materialLabel: "Glass",
  },
  {
    id: "magma",
    name: "Molten Core",
    shortName: "Magma",
    description: "Dark volcanic faces with hot orange seams.",
    defaultColor: "#ea580c",
    accent: "#fb923c",
    textColor: "#ffffff",
    gradient: "linear-gradient(145deg, #1f130f 0%, #7c2d12 48%, #f97316 100%)",
    surface: "rgba(234, 88, 12, 0.15)",
    border: "rgba(251, 146, 60, 0.48)",
    glow: "rgba(249, 115, 22, 0.48)",
    textShadow: "0 0 7px rgba(251,146,60,0.82), 0 1px 2px rgba(0,0,0,0.9)",
    materialLabel: "Lava",
  },
  {
    id: "ice",
    name: "Frost Shard",
    shortName: "Ice",
    description: "Pale blue crystalline dice with cold white facets.",
    defaultColor: "#38bdf8",
    accent: "#bae6fd",
    textColor: "#ffffff",
    gradient: "linear-gradient(145deg, rgba(224,242,254,0.52) 0%, rgba(56,189,248,0.38) 55%, rgba(12,74,110,0.52) 100%)",
    surface: "rgba(56, 189, 248, 0.13)",
    border: "rgba(186, 230, 253, 0.58)",
    glow: "rgba(56, 189, 248, 0.42)",
    textShadow: "0 0 6px rgba(186,230,253,0.74), 0 1px 2px rgba(0,0,0,0.84)",
    materialLabel: "Crystal",
  },
  {
    id: "gold",
    name: "Royal Gold",
    shortName: "Gold",
    description: "Warm metallic dice with dark stamped numerals.",
    defaultColor: "#fbbf24",
    accent: "#fde68a",
    textColor: "#1f1402",
    gradient: "linear-gradient(145deg, #fde68a 0%, #d97706 58%, #78350f 100%)",
    surface: "rgba(251, 191, 36, 0.13)",
    border: "rgba(253, 230, 138, 0.55)",
    glow: "rgba(251, 191, 36, 0.48)",
    textShadow: "0 1px 1px rgba(255,255,255,0.72)",
    materialLabel: "Metal",
  },
  {
    id: "obsidian",
    name: "Void Obsidian",
    shortName: "Obsidian",
    description: "Gloss black stone with sharp silver highlights.",
    defaultColor: "#111827",
    accent: "#94a3b8",
    textColor: "#ffffff",
    gradient: "linear-gradient(145deg, #020617 0%, #111827 55%, #475569 100%)",
    surface: "rgba(148, 163, 184, 0.09)",
    border: "rgba(148, 163, 184, 0.32)",
    glow: "rgba(148, 163, 184, 0.28)",
    textShadow: "0 0 4px rgba(255,255,255,0.55), 0 1px 2px rgba(0,0,0,0.92)",
    materialLabel: "Gloss",
  },
  {
    id: "stone",
    name: "Runic Stone",
    shortName: "Stone",
    description: "Weathered grey dice with carved, readable numerals.",
    defaultColor: "#6b7280",
    accent: "#d1d5db",
    textColor: "#f3f4f6",
    gradient: "linear-gradient(145deg, #d1d5db 0%, #6b7280 50%, #1f2937 100%)",
    surface: "rgba(156, 163, 175, 0.11)",
    border: "rgba(209, 213, 219, 0.34)",
    glow: "rgba(156, 163, 175, 0.24)",
    textShadow: "0 -1px 0 rgba(0,0,0,0.9), 0 1px 0 rgba(255,255,255,0.16)",
    materialLabel: "Stone",
  },
  {
    id: "wood",
    name: "Elderwood",
    shortName: "Wood",
    description: "Dark carved timber with warm amber numbering.",
    defaultColor: "#854d0e",
    accent: "#facc15",
    textColor: "#fef3c7",
    gradient: "linear-gradient(145deg, #78350f 0%, #92400e 48%, #451a03 100%)",
    surface: "rgba(180, 83, 9, 0.13)",
    border: "rgba(250, 204, 21, 0.32)",
    glow: "rgba(180, 83, 9, 0.35)",
    textShadow: "0 1px 2px rgba(0,0,0,0.92)",
    materialLabel: "Carved",
  },
];

export const DICE_COLOR_PRESETS = [
  { name: "Arcane Violet", value: "#7c3aed" },
  { name: "Crimson", value: "#dc2626" },
  { name: "Emerald", value: "#059669" },
  { name: "Sapphire", value: "#2563eb" },
  { name: "Amber", value: "#d97706" },
  { name: "Slate", value: "#334155" },
  { name: "Rose", value: "#db2777" },
  { name: "Teal", value: "#0f766e" },
];

export function getDiceThemeOption(themeId) {
  return DICE_THEME_OPTIONS.find((theme) => theme.id === themeId) || DICE_THEME_OPTIONS[0];
}

export function normalizeDiceTheme(themeId) {
  return getDiceThemeOption(themeId).id;
}

export function diceHexToRgb(hex) {
  const cleanHex = String(hex || "").replace("#", "");
  const normalized = cleanHex.length === 3
    ? cleanHex.split("").map((char) => char + char).join("")
    : cleanHex.padEnd(6, "0").slice(0, 6);
  const value = parseInt(normalized, 16);
  if (Number.isNaN(value)) return "124, 58, 237";
  return `${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}`;
}

export function getDiceThemePreviewStyles(themeId, color) {
  const theme = getDiceThemeOption(themeId);
  const rgb = diceHexToRgb(color || theme.defaultColor);

  return {
    theme,
    box: {
      background: `radial-gradient(circle at 28% 18%, rgba(${rgb}, 0.22), transparent 44%), ${theme.surface}`,
      border: `1px solid ${theme.border}`,
      boxShadow: `0 0 26px ${theme.glow}, inset 0 1px 0 rgba(255,255,255,0.08)`,
    },
    die: {
      background: theme.id === "default"
        ? `linear-gradient(145deg, ${color || theme.defaultColor} 0%, rgba(${rgb}, 0.56) 58%, rgba(0,0,0,0.58) 100%)`
        : `radial-gradient(circle at 28% 22%, rgba(${rgb}, 0.24), transparent 42%), ${theme.gradient}`,
      border: `1px solid ${theme.border}`,
      boxShadow: `inset 0 1px 9px rgba(255,255,255,0.22), inset 0 -10px 18px rgba(0,0,0,0.38), 0 10px 22px ${theme.glow}`,
    },
    text: {
      color: theme.textColor,
      textShadow: theme.textShadow,
    },
    chip: {
      background: `linear-gradient(135deg, rgba(${rgb}, 0.28), rgba(0,0,0,0.16))`,
      border: `1px solid ${theme.border}`,
      color: theme.id === "gold" ? "#fef3c7" : theme.accent,
      boxShadow: `0 0 14px ${theme.glow}`,
    },
  };
}
