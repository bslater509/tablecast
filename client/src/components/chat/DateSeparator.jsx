// =============================================================================
// Tablecast — Date Separator Component
// Shows "Today", "Yesterday", or a formatted date between message groups.
// =============================================================================
import { formatDateLabel } from "./chatUtils";

export default function DateSeparator({ timestamp }) {
  return (
    <div className="date-separator">
      <span className="date-separator-inner">{formatDateLabel(timestamp)}</span>
    </div>
  );
}
