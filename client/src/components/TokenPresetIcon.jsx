import { NPC_TOKEN_PRESETS } from "../data/npcTokenPresets";

/**
 * Renders an inline SVG token: colored circle + Lucide icon.
 * Used for preset selection buttons in WikiPanel and MapPanel.
 */
export default function TokenPresetIcon({ label, size = 40, borderWidth = 2 }) {
  const config = NPC_TOKEN_PRESETS.find((p) => p.label === label);
  if (!config) {
    // Fallback: gray circle with first letter
    const letter = (label || "?")[0].toUpperCase();
    return (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="48" fill="#555" />
        <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={borderWidth} />
        <text x="50" y="56" textAnchor="middle" fontSize="40" fontWeight="bold" fill="white" fontFamily="sans-serif">
          {letter}
        </text>
      </svg>
    );
  }

  const Icon = config.icon;
  const borderColor = config.borderColor || "rgba(255,255,255,0.15)";
  const iconSize = size * 0.4;

  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="48" fill={config.color} />
      <circle cx="50" cy="50" r="44" fill="none" stroke={borderColor} strokeWidth={borderWidth} />
      <foreignObject x="25" y="25" width="50" height="50">
        <Icon size={iconSize} color="white" style={{ display: "block", margin: "auto" }} />
      </foreignObject>
    </svg>
  );
}
