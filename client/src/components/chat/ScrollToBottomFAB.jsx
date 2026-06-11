// =============================================================================
// Tablecast — Scroll-to-Bottom FAB Component
// Floating action button to jump to the latest messages with unread badge.
// =============================================================================
import { ChevronDown } from "lucide-react";

export default function ScrollToBottomFAB({ onClick, count }) {
  return (
    <button className="scroll-fab fade-in" onClick={onClick} type="button" aria-label="Scroll to bottom">
      <ChevronDown size={20} />
      {count > 0 && <span className="scroll-fab-badge">{count > 9 ? "9+" : count}</span>}
    </button>
  );
}
