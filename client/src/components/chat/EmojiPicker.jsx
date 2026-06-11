// =============================================================================
// Tablecast — Emoji Picker Component
// A simple emoji grid for inserting emoji into chat messages.
// =============================================================================
import { EMOJI_LIST } from "./chatUtils";

export default function EmojiPicker({ onSelect, visible }) {
  if (!visible) return null;
  return (
    <div className="emoji-picker fade-in">
      {EMOJI_LIST.map((emoji) => (
        <button
          key={emoji}
          className="emoji-picker-btn"
          onClick={() => onSelect(emoji)}
          type="button"
          aria-label={emoji}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
