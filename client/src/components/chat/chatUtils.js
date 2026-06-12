// =============================================================================
// Tablecast — Chat Panel Utilities
// Pure helper functions for the WhatsApp-style Chat Panel.
// =============================================================================
import { isOwnMessage } from "../../utils/authHeaders";

// ---------------------------------------------------------------------------
// Message grouping
// ---------------------------------------------------------------------------

export function groupMessages(messages, user) {
  const groups = [];
  let currentGroup = null;

  for (const msg of messages) {
    const isSystem = msg.type === "system" && msg.sender === "System";
    const isMine = !isSystem && isOwnMessage(msg, user);
    const sender = msg.sender || "Unknown";
    const msgTime = Number(msg.timestamp) || 0;

    const shouldStartNew =
      !currentGroup ||
      currentGroup.isSystem !== isSystem ||
      currentGroup.sender !== sender ||
      msgTime - currentGroup.lastTimestamp > 120000;

    if (shouldStartNew) {
      currentGroup = {
        id: genGroupId(),
        messages: [],
        sender,
        isMine,
        isSystem,
        lastTimestamp: msgTime,
      };
      groups.push(currentGroup);
    }

    currentGroup.messages.push(msg);
    currentGroup.lastTimestamp = msgTime;
  }

  return groups;
}

let groupIdCounter = 0;
export function genGroupId() {
  return `grp_${Date.now()}_${++groupIdCounter}`;
}

// ---------------------------------------------------------------------------
// Sender colors
// ---------------------------------------------------------------------------

export const SENDER_COLORS = [
  "#c8973a", "#6fcf97", "#56ccf2", "#eb5757",
  "#bb6bd9", "#f2994a", "#27ae60", "#2d9cdb",
  "#f2c94c", "#9b51e0", "#219653", "#e8636b",
];

export function getSenderColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return SENDER_COLORS[Math.abs(hash) % SENDER_COLORS.length];
}

export function getSenderInitial(name) {
  return (name || "?").charAt(0).toUpperCase();
}

// ---------------------------------------------------------------------------
// Dice notation parsing
// ---------------------------------------------------------------------------

export function parseDiceNotation(text) {
  const clean = text.replace(/^\/(roll|r)\s+/i, "").trim();
  const regex = /^(\d+)?d(\d+)(?:\s*([+-])\s*(\d+))?$/i;
  const match = clean.match(regex);
  if (!match) return null;
  const qty = match[1] ? parseInt(match[1], 10) : 1;
  const sides = parseInt(match[2], 10);
  const sign = match[3] || "+";
  const modifierVal = match[4] ? parseInt(match[4], 10) : 0;
  const modifier = sign === "-" ? -modifierVal : modifierVal;
  return { qty, sides, modifier };
}

// ---------------------------------------------------------------------------
// Time and date formatting
// ---------------------------------------------------------------------------

export function formatTime(timestamp) {
  return new Date(Number(timestamp)).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateLabel(timestamp) {
  const date = new Date(Number(timestamp));
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (msgDate.getTime() === today.getTime()) return "Today";
  if (msgDate.getTime() === yesterday.getTime()) return "Yesterday";
  return date.toLocaleDateString([], {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
}

export function getDateKey(timestamp) {
  const d = new Date(Number(timestamp));
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// ---------------------------------------------------------------------------
// Message merging (deduplicates by id)
// ---------------------------------------------------------------------------

export function mergeMessages(...messageLists) {
  const byId = new Map();
  for (const list of messageLists) {
    for (const msg of list) {
      if (msg?.id) byId.set(msg.id, msg);
    }
  }
  return Array.from(byId.values()).sort((a, b) => {
    const aTime = Number(a.timestamp) || 0;
    const bTime = Number(b.timestamp) || 0;
    return aTime - bTime;
  });
}

// ---------------------------------------------------------------------------
// Temp ID generator
// ---------------------------------------------------------------------------

let tempIdCounter = 0;
export function genTempId() {
  return `tmp_${Date.now()}_${++tempIdCounter}`;
}

// ---------------------------------------------------------------------------
// Emoji list
// ---------------------------------------------------------------------------

export const EMOJI_LIST = [
  "😀","😂","🤣","😊","😎","🤩","😢","😱",
  "🔥","⭐","👍","🎉","❤️","💀","👋","💪",
  "🎲","⚔️","🛡️","🧙","🐉","📖","💬","🗡️",
  "🏹","🪄","💎","👑","🍺","🏰","🌲","✨",
];
