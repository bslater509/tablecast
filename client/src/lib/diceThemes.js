export const DICE_THEME_OPTIONS = [
  {
    id: "default",
    name: "Arcane Violet",
    shortName: "Violet",
    description: "Satin arcane dice with crisp ivory numerals.",
    defaultColor: "#7c3aed",
    accent: "#a78bfa",
    textColor: "#ffffff",
    gradient: "linear-gradient(145deg, #7c3aed 0%, #4c1d95 58%, #20113f 100%)",
    surface: "rgba(124, 58, 237, 0.16)",
    border: "rgba(167, 139, 250, 0.45)",
    glow: "rgba(124, 58, 237, 0.42)",
    textShadow: "0 1px 2px rgba(0,0,0,0.85)",
    materialLabel: "Satin",
    preview: "satin",
  },
  {
    id: "glass",
    name: "Astral Glass",
    shortName: "Glass",
    description: "Translucent crystal edges with bright engraved numerals.",
    defaultColor: "#a5f3fc",
    accent: "#67e8f9",
    textColor: "#ffffff",
    gradient: "linear-gradient(145deg, rgba(207,250,254,0.38) 0%, rgba(14,116,144,0.24) 55%, rgba(15,23,42,0.56) 100%)",
    surface: "rgba(103, 232, 249, 0.12)",
    border: "rgba(207, 250, 254, 0.58)",
    glow: "rgba(103, 232, 249, 0.48)",
    textShadow: "0 0 5px rgba(255,255,255,0.72), 0 1px 2px rgba(0,0,0,0.88)",
    materialLabel: "Glass",
    preview: "glass",
  },
  {
    id: "magma",
    name: "Molten Core",
    shortName: "Magma",
    description: "Dark volcanic faces with hot orange fissures.",
    defaultColor: "#ea580c",
    accent: "#fb923c",
    textColor: "#ffffff",
    gradient: "linear-gradient(145deg, #1f130f 0%, #7c2d12 48%, #f97316 100%)",
    surface: "rgba(234, 88, 12, 0.15)",
    border: "rgba(251, 146, 60, 0.48)",
    glow: "rgba(249, 115, 22, 0.48)",
    textShadow: "0 0 7px rgba(251,146,60,0.82), 0 1px 2px rgba(0,0,0,0.9)",
    materialLabel: "Lava",
    preview: "magma",
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
    preview: "ice",
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
    preview: "gold",
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
    preview: "obsidian",
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
    preview: "stone",
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
    preview: "wood",
  },
];

export const DICE_COLOR_PRESETS = [
  { name: "Arcane Violet", value: "#7c3aed" },
  { name: "Astral Cyan", value: "#06b6d4" },
  { name: "Crimson", value: "#dc2626" },
  { name: "Emerald", value: "#059669" },
  { name: "Sapphire", value: "#2563eb" },
  { name: "Amber", value: "#d97706" },
  { name: "Royal Gold", value: "#fbbf24" },
  { name: "Slate", value: "#334155" },
  { name: "Rose", value: "#db2777" },
  { name: "Teal", value: "#0f766e" },
  { name: "Bone", value: "#e7dcc4" },
  { name: "Obsidian", value: "#111827" },
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

function getPreviewDieBackground(theme, color, rgb) {
  const selectedColor = color || theme.defaultColor;

  switch (theme.preview) {
    case "glass":
      return [
        "linear-gradient(145deg, rgba(255,255,255,0.68), rgba(255,255,255,0.08) 28%, rgba(8,47,73,0.28) 100%)",
        "repeating-linear-gradient(135deg, rgba(255,255,255,0.28) 0 2px, transparent 2px 12px)",
        `radial-gradient(circle at 28% 18%, rgba(${rgb}, 0.82), transparent 34%)`,
        theme.gradient,
      ].join(", ");
    case "magma":
      return [
        "radial-gradient(circle at 70% 78%, rgba(255,237,213,0.72), transparent 8%)",
        "repeating-linear-gradient(118deg, transparent 0 13px, rgba(251,146,60,0.75) 13px 16px, transparent 16px 31px)",
        `radial-gradient(circle at 26% 18%, rgba(${rgb}, 0.42), transparent 38%)`,
        theme.gradient,
      ].join(", ");
    case "ice":
      return [
        "linear-gradient(45deg, rgba(255,255,255,0.76), transparent 24%, rgba(186,230,253,0.34) 52%, transparent 76%)",
        "repeating-linear-gradient(135deg, rgba(255,255,255,0.18) 0 1px, transparent 1px 11px)",
        `radial-gradient(circle at 24% 18%, rgba(${rgb}, 0.62), transparent 42%)`,
        theme.gradient,
      ].join(", ");
    case "gold":
      return [
        "linear-gradient(105deg, rgba(255,255,255,0.6), transparent 18%, rgba(120,53,15,0.34) 62%, rgba(255,255,255,0.22) 100%)",
        "repeating-linear-gradient(90deg, rgba(255,255,255,0.14) 0 1px, transparent 1px 8px)",
        theme.gradient,
      ].join(", ");
    case "obsidian":
      return [
        "linear-gradient(145deg, rgba(255,255,255,0.2), transparent 18%, rgba(2,6,23,0.68) 62%, rgba(148,163,184,0.28) 100%)",
        "radial-gradient(circle at 74% 26%, rgba(226,232,240,0.22), transparent 18%)",
        theme.gradient,
      ].join(", ");
    case "stone":
      return [
        "repeating-linear-gradient(52deg, transparent 0 14px, rgba(17,24,39,0.22) 14px 16px, transparent 16px 34px)",
        "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.18), transparent 36%)",
        theme.gradient,
      ].join(", ");
    case "wood":
      return [
        "repeating-radial-gradient(circle at 32% 24%, rgba(254,243,199,0.16) 0 3px, transparent 3px 10px, rgba(69,26,3,0.2) 10px 14px)",
        "linear-gradient(145deg, rgba(250,204,21,0.12), transparent 42%)",
        theme.gradient,
      ].join(", ");
    case "satin":
    default:
      return `linear-gradient(145deg, ${selectedColor} 0%, rgba(${rgb}, 0.56) 58%, rgba(0,0,0,0.58) 100%)`;
  }
}

export function getDiceThemePreviewStyles(themeId, color) {
  const theme = getDiceThemeOption(themeId);
  const rgb = diceHexToRgb(color || theme.defaultColor);
  const isTranslucent = theme.preview === "glass" || theme.preview === "ice";

  return {
    theme,
    box: {
      background: `radial-gradient(circle at 28% 18%, rgba(${rgb}, 0.24), transparent 42%), radial-gradient(circle at 78% 74%, ${theme.glow}, transparent 34%), ${theme.surface}`,
      border: `1px solid ${theme.border}`,
      boxShadow: `0 0 26px ${theme.glow}, inset 0 1px 0 rgba(255,255,255,0.1)`,
    },
    die: {
      background: getPreviewDieBackground(theme, color, rgb),
      border: `1px solid ${theme.border}`,
      boxShadow: isTranslucent
        ? `inset 0 1px 10px rgba(255,255,255,0.28), inset 0 -12px 20px rgba(0,0,0,0.42), 0 10px 22px ${theme.glow}, 0 0 0 1px rgba(255,255,255,0.18)`
        : `inset 0 1px 10px rgba(255,255,255,0.28), inset 0 -12px 20px rgba(0,0,0,0.42), 0 10px 22px ${theme.glow}`,
      opacity: isTranslucent ? 0.92 : 1,
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
