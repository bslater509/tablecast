// NPC token presets shared across WikiPanel NPC editor and MapPanel token creation
// Each preset has a Lucide icon name, background color, and optional border color.
import {
  Sword, Swords, Shield, ShieldCheck, Skull, Crown, Eye, Heart, Dog, Users,
} from "lucide-react";

export const NPC_TOKEN_PRESETS = [
  { label: "Bandit", icon: Swords, color: "#8B2252" },
  { label: "Goblin", icon: Eye, color: "#2E7D32" },
  { label: "Goblin Boss", icon: Crown, color: "#1B5E20", borderColor: "#FFD700" },
  { label: "Skeleton", icon: Skull, color: "#546E7A" },
  { label: "Orc", icon: Sword, color: "#4E342E" },
  { label: "Guard", icon: Shield, color: "#1565C0" },
  { label: "Knight", icon: ShieldCheck, color: "#0D47A1" },
  { label: "Cultist", icon: Eye, color: "#6A1B9A" },
  { label: "Zombie", icon: Heart, color: "#558B2F" },
  { label: "Wolf", icon: Dog, color: "#37474F" },
  { label: "Mercenary", icon: Swords, color: "#BF360C" },
  { label: "Villager", icon: Users, color: "#4E342E" },
];

/** Pick a matching preset label for a given NPC name/race string */
export function matchNpcPreset(name = "", race = "") {
  const search = `${name} ${race}`.toLowerCase();
  const found = NPC_TOKEN_PRESETS.find((p) => search.includes(p.label.toLowerCase()));
  return found || NPC_TOKEN_PRESETS.find((p) => p.label === "Guard"); // fallback
}

/**
 * Generate an SVG token data URI on the client.
 * Returns a data:image/svg+xml;base64 URL with a colored circle + initial letter.
 */
export function generateTokenSvgUrl(name = "", race = "") {
  const letter = (name || race || "?")[0].toUpperCase();
  const preset = matchNpcPreset(name, race);
  const color = preset?.color || "#555";
  const border = preset?.borderColor || "rgba(255,255,255,0.2)";

  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">',
    `<circle cx="50" cy="50" r="48" fill="${color}"/>`,
    `<circle cx="50" cy="50" r="44" fill="none" stroke="${border}" stroke-width="3"/>`,
    `<text x="50" y="56" text-anchor="middle" font-size="38" font-weight="bold" fill="white" font-family="sans-serif">${letter}</text>`,
    "</svg>",
  ].join("");

  return `data:image/svg+xml;base64,${btoa(svg)}`;
}
