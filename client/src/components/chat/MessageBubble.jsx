// =============================================================================
// Tablecast — Message Bubble Component
// Renders a single chat message with WhatsApp-style layout: roll cards,
// AI scholar messages, NPC roleplay, system notices, and plain text.
// =============================================================================
import { Sparkles } from "lucide-react";
import { compileMarkdown } from "../../utils/markdown";
import AiStreamingIndicator from "../AiStreamingIndicator";
import CopyButton from "./CopyButton";
import { formatTime, getSenderColor } from "./chatUtils";

export default function MessageBubble({ msg, isMine, isGroupStart, isGroupEnd, status, npcs }) {
  const msgTime = formatTime(msg.timestamp);
  const isRoll = msg.type === "roll" && msg.rollDetails;
  const isAi = msg.sender === "D&D AI Assistant";
  const isNpc = msg.type === "npc";
  const isSystem = msg.type === "system" && msg.sender === "System";
  const isPlain = !isRoll && !isAi && !isNpc && !isSystem;

  // System messages: centered, no bubble
  if (isSystem) {
    return (
      <div
        className="msg-enter"
        style={{
          display: "flex",
          justifyContent: "center",
          margin: "0.4rem 0",
        }}
      >
        <span
          style={{
            fontSize: "0.72rem",
            color: "var(--color-muted)",
            fontStyle: "italic",
            textAlign: "center",
            background: "rgba(200,151,58,0.06)",
            padding: "0.2rem 0.8rem",
            borderRadius: "999px",
            maxWidth: "85%",
          }}
        >
          {msg.text}
        </span>
      </div>
    );
  }

  // Bubble color
  const bgColor = isMine ? "var(--color-accent)" : "rgba(255,255,255,0.06)";
  const textColor = isMine ? "var(--color-bg)" : "var(--color-text)";

  // —— Plain text bubble ——
  if (isPlain) {
    return (
      <div
        className={`chat-bubble-wrapper ${isMine ? "mine" : "theirs"} msg-enter`}
        style={{
          "--bubble-bg": bgColor,
          background: bgColor,
          color: textColor,
          borderRadius: "1rem",
          padding: "0.45rem 0.85rem",
          marginBottom: isGroupEnd ? "0.15rem" : "0.08rem",
          borderBottomLeftRadius: isMine ? "1rem" : isGroupEnd ? "0.35rem" : "0.35rem",
          borderBottomRightRadius: !isMine ? "1rem" : isGroupEnd ? "0.35rem" : "0.35rem",
        }}
      >
        {/* Sender name for theirs (only on first msg of group) */}
        {!isMine && isGroupStart && (
          <div
            style={{
              fontSize: "0.65rem",
              fontWeight: 700,
              color: getSenderColor(msg.sender),
              marginBottom: "0.15rem",
            }}
          >
            {msg.sender}
          </div>
        )}

        {/* Message text — mine: plain text | theirs: markdown */}
        {isMine ? (
          <div
            style={{
              fontSize: "0.9rem",
              lineHeight: 1.4,
              color: textColor,
              whiteSpace: "pre-wrap",
            }}
          >
            {msg.text}
          </div>
        ) : (
          <div
            className="wiki-content"
            style={{
              fontSize: "0.9rem",
              lineHeight: 1.4,
              color: textColor,
            }}
            dangerouslySetInnerHTML={{ __html: compileMarkdown(msg.text) }}
          />
        )}

        {/* Timestamp + status */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "0.2rem",
            marginTop: "0.15rem",
          }}
        >
          <span
            style={{
              fontSize: "0.6rem",
              color: isMine ? "rgba(15,14,23,0.5)" : "var(--color-muted)",
              lineHeight: 1,
            }}
          >
            {msgTime}
          </span>
          {isMine && status && (
            <span
              style={{
                fontSize: "0.6rem",
                lineHeight: 1,
                color: status === "failed"
                  ? "var(--color-danger)"
                  : status === "sent"
                    ? (isMine ? "rgba(15,14,23,0.5)" : "var(--color-muted)")
                    : "var(--color-muted)",
              }}
            >
              {status === "failed" ? "\u26A0\uFE0F" : status === "sent" ? "\u2713\u2713" : "\u2713"}
            </span>
          )}
        </div>

        {/* Tail */}
        <div className="bubble-tail" />
      </div>
    );
  }

  // —— Roll card ——
  if (isRoll) {
    const rd = msg.rollDetails;
    return (
      <div
        className={`chat-bubble-wrapper ${isMine ? "mine" : "theirs"} msg-enter`}
        style={{
          "--bubble-bg": bgColor,
          background: bgColor,
          color: textColor,
          borderRadius: "1rem",
          padding: "0.6rem 0.85rem",
          marginBottom: "0.15rem",
        }}
      >
        {/* Sender name for theirs */}
        {!isMine && isGroupStart && (
          <div style={{ fontSize: "0.65rem", fontWeight: 700, color: getSenderColor(msg.sender), marginBottom: "0.2rem" }}>
            {msg.sender}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(200,151,58,0.15)", paddingBottom: "0.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <span style={{ fontSize: "1rem" }}>{rd.isAttack ? "\u2694\uFE0F" : "\uD83C\uDFB2"}</span>
            <span style={{ fontSize: "0.85rem", fontWeight: "bold", color: isMine ? textColor : "var(--color-accent)" }}>
              {rd.rollName}
            </span>
          </div>
          <span style={{ fontSize: "0.6rem", color: isMine ? "rgba(15,14,23,0.5)" : "var(--color-muted)" }}>
            {msgTime}
          </span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.7rem", marginTop: "0.2rem" }}>
          <span style={{ fontWeight: 700, color: isMine ? textColor : "var(--color-accent)" }}>
            {msg.sender}
          </span>
          <span style={{ fontFamily: "monospace", color: isMine ? "rgba(15,14,23,0.6)" : "var(--color-muted)" }}>
            {rd.formula}
          </span>
        </div>

        {rd.status === "rolling" ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "0.5rem 0", background: "rgba(0,0,0,0.1)", borderRadius: "6px", marginTop: "0.25rem" }}>
            <span style={{ fontSize: "1rem", fontStyle: "italic", color: isMine ? textColor : "var(--color-accent)" }} className="text-pulse">
              {"\uD83C\uDFB2"} Rolling...
            </span>
          </div>
        ) : rd.isAttack ? (
          <div style={{ display: "flex", justifyContent: "space-around", alignItems: "center", padding: "0.4rem 0", background: "rgba(0,0,0,0.1)", borderRadius: "6px", marginTop: "0.25rem" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ fontSize: "0.55rem", color: isMine ? "rgba(15,14,23,0.5)" : "var(--color-muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em" }}>
                To Hit
              </span>
              <span style={{ fontSize: "1.5rem", fontWeight: 800, lineHeight: 1.2, color: isMine ? textColor : "var(--color-accent)" }}>
                {rd.toHitTotal}
              </span>
              <span style={{ fontSize: "0.6rem", color: isMine ? "rgba(15,14,23,0.5)" : "var(--color-muted)" }}>
                1d20({rd.toHitRoll}) {rd.toHitMod >= 0 ? `+` : ``}{rd.toHitMod}
              </span>
            </div>
            <div style={{ width: "1px", height: "36px", background: "rgba(255,255,255,0.08)" }} />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ fontSize: "0.55rem", color: isMine ? "rgba(15,14,23,0.5)" : "var(--color-muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em" }}>
                Damage
              </span>
              <span style={{ fontSize: "1.5rem", fontWeight: 800, lineHeight: 1.2, color: isMine ? textColor : "var(--color-danger)" }}>
                {rd.damageTotal}
              </span>
              <span style={{ fontSize: "0.6rem", color: isMine ? "rgba(15,14,23,0.5)" : "var(--color-muted)" }}>
                {rd.damageDice}({rd.damageRolls.join("+")}) {rd.damageMod >= 0 ? `+` : ``}{rd.damageMod}
              </span>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "center", padding: "0.5rem 0", background: "rgba(0,0,0,0.1)", borderRadius: "6px", marginTop: "0.25rem" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ fontSize: "1.6rem", fontWeight: 800, lineHeight: 1.2, color: isMine ? textColor : "var(--color-accent)" }}>
                {rd.total}
              </span>
              <span style={{ fontSize: "0.6rem", color: isMine ? "rgba(15,14,23,0.5)" : "var(--color-muted)" }}>
                Rolled: {rd.rolls.join(", ")} {rd.modifier >= 0 ? `+` : ``}{rd.modifier}
              </span>
            </div>
          </div>
        )}

        {/* Tail */}
        <div className="bubble-tail" />
      </div>
    );
  }

  // —— AI message ——
  if (isAi) {
    return (
      <div
        className={`chat-bubble-wrapper theirs msg-enter`}
        style={{
          "--bubble-bg": "rgba(200,151,58,0.07)",
          background: "rgba(200,151,58,0.07)",
          color: "var(--color-text)",
          border: "1px solid rgba(200,151,58,0.25)",
          borderRadius: "1rem",
          padding: "0.65rem 0.85rem",
          marginBottom: "0.15rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(200,151,58,0.12)", paddingBottom: "0.25rem", marginBottom: "0.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <Sparkles size={13} style={{ color: "var(--color-accent)" }} />
            <span style={{ fontSize: "0.8rem", fontWeight: "bold", color: "var(--color-accent)" }}>
              D&D AI Scholar
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <span style={{ fontSize: "0.6rem", color: "var(--color-muted)" }}>{msgTime}</span>
            <CopyButton text={msg.text} />
          </div>
        </div>
        <div
          className="wiki-content"
          style={{ fontSize: "0.9rem", color: "var(--color-text)", lineHeight: 1.45 }}
          dangerouslySetInnerHTML={{ __html: compileMarkdown(msg.text) }}
        />
        {msg.text === "_Thinking\u2026" && (
          <AiStreamingIndicator text="Thinking" />
        )}
        <div className="bubble-tail" />
      </div>
    );
  }

  // —— NPC message ——
  if (isNpc) {
    const matchedNpc = npcs?.find((n) => n.name.toLowerCase() === msg.sender.toLowerCase());
    const npcAvatar = matchedNpc?.imageUrl || matchedNpc?.largeImageUrl || "";
    return (
      <div
        className={`chat-bubble-wrapper theirs msg-enter`}
        style={{
          "--bubble-bg": "rgba(245,235,215,0.04)",
          background: "rgba(245,235,215,0.04)",
          color: "var(--color-text)",
          borderLeft: "4px solid var(--color-accent)",
          borderTop: "1px solid rgba(255,255,255,0.05)",
          borderRight: "1px solid rgba(255,255,255,0.05)",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          borderRadius: "0.35rem 1rem 1rem 0.35rem",
          padding: "0.65rem 0.85rem",
          marginBottom: "0.15rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "0.25rem", marginBottom: "0.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            {npcAvatar ? (
              <img src={npcAvatar} alt={msg.sender} style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover", border: "1px solid var(--color-accent)" }} />
            ) : (
              <span style={{ fontSize: "0.9rem" }}>{"\uD83D\uDDE3\uFE0F"}</span>
            )}
            <span style={{ fontSize: "0.8rem", fontWeight: "bold", color: "var(--color-accent)", fontFamily: "Georgia, serif" }}>
              {msg.sender}
            </span>
          </div>
          <span style={{ fontSize: "0.6rem", color: "var(--color-muted)" }}>{msgTime}</span>
        </div>
        <div
          className="wiki-content"
          style={{ fontSize: "0.9rem", color: "var(--color-text)", fontFamily: "Georgia, serif", fontStyle: "italic", lineHeight: 1.5 }}
          dangerouslySetInnerHTML={{ __html: compileMarkdown(msg.text) }}
        />
        <div className="bubble-tail" />
      </div>
    );
  }

  return null;
}
