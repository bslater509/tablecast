import Skeleton from "./Skeleton";

function PanelFrame({ children, style = {} }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
        padding: "1rem",
        borderRadius: "16px",
        background: "var(--glass-bg)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 18px 40px rgba(0,0,0,0.28)",
        minHeight: "100%",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function BubbleSkeleton({ align = "left", lines = [72, 58], compact = false }) {
  const isRight = align === "right";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: isRight ? "flex-end" : "flex-start",
      }}
    >
      <div
        style={{
          maxWidth: "78%",
          minWidth: "40%",
          padding: "0.8rem 0.9rem",
          borderRadius: isRight ? "1rem 1rem 0.35rem 1rem" : "1rem 1rem 1rem 0.35rem",
          background: isRight ? "rgba(200,151,58,0.08)" : "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {lines.map((w, i) => (
          <Skeleton
            key={i}
            width={`${w}%`}
            height={compact ? 10 : i === 0 ? 13 : 10}
            borderRadius={9999}
            style={{ marginBottom: i === lines.length - 1 ? 0 : 8 }}
          />
        ))}
      </div>
    </div>
  );
}

function CardSkeleton({ compact = false }) {
  return (
    <div
      style={{
        display: "flex",
        gap: "0.9rem",
        alignItems: "flex-start",
        padding: "0.9rem",
        borderRadius: "14px",
        border: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(255,255,255,0.03)",
      }}
    >
      <Skeleton variant="circle" width={compact ? 40 : 48} height={compact ? 40 : 48} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Skeleton width="46%" height={14} style={{ marginBottom: 8 }} />
        <Skeleton width="72%" height={10} style={{ marginBottom: 6 }} />
        <Skeleton width="58%" height={10} style={{ marginBottom: 10 }} />
        <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
          <Skeleton width={52} height={22} borderRadius={9999} />
          <Skeleton width={46} height={22} borderRadius={9999} />
          <Skeleton width={58} height={22} borderRadius={9999} />
        </div>
      </div>
    </div>
  );
}

export function ChatPanelSkeleton() {
  return (
    <PanelFrame style={{ gap: "0.9rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <Skeleton variant="circle" width={38} height={38} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Skeleton width="38%" height={16} style={{ marginBottom: 6 }} />
          <Skeleton width="22%" height={10} />
        </div>
        <Skeleton width={64} height={28} borderRadius={9999} />
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.85rem",
          flex: 1,
          minHeight: "320px",
          padding: "0.25rem 0",
        }}
      >
        <BubbleSkeleton lines={[68, 48]} />
        <BubbleSkeleton align="right" lines={[54, 36]} compact />
        <BubbleSkeleton lines={[72, 60, 44]} />
        <BubbleSkeleton align="right" lines={[46]} compact />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.7rem" }}>
        <Skeleton variant="circle" width={40} height={40} />
        <Skeleton height={44} borderRadius={18} style={{ flex: 1 }} />
        <Skeleton variant="circle" width={40} height={40} />
      </div>
    </PanelFrame>
  );
}

export function MapPanelSkeleton() {
  return (
    <PanelFrame style={{ gap: "0.9rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
        <Skeleton width="28%" height={16} />
        <Skeleton width={78} height={28} borderRadius={9999} />
      </div>

      <div style={{ display: "flex", gap: "0.85rem", minHeight: "420px" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <Skeleton variant="rect" height={320} borderRadius={18} style={{ flex: 1, minHeight: 280 }} />
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Skeleton width={88} height={34} borderRadius={12} />
            <Skeleton width={88} height={34} borderRadius={12} />
            <Skeleton width={88} height={34} borderRadius={12} />
          </div>
        </div>

        <div style={{ width: 64, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <Skeleton variant="circle" width={64} height={64} />
          <Skeleton variant="circle" width={64} height={64} />
          <Skeleton variant="circle" width={64} height={64} />
          <Skeleton variant="circle" width={64} height={64} />
        </div>
      </div>
    </PanelFrame>
  );
}

export function CharacterListSkeleton() {
  return (
    <PanelFrame style={{ gap: "0.8rem" }}>
      <Skeleton width="44%" height={18} />
      <Skeleton width="66%" height={12} />
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton compact />
        <CardSkeleton />
      </div>
    </PanelFrame>
  );
}

export function WikiPanelSkeleton() {
  return (
    <PanelFrame style={{ gap: "0.9rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
        <Skeleton width="34%" height={18} />
        <Skeleton width={92} height={32} borderRadius={9999} />
      </div>

      <div style={{ display: "flex", gap: "0.9rem", minHeight: "520px" }}>
        <div style={{ width: "30%", minWidth: 168, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <Skeleton width="62%" height={14} />
          <Skeleton width="84%" height={36} borderRadius={14} />
          <Skeleton width="92%" height={36} borderRadius={14} />
          <Skeleton width="76%" height={36} borderRadius={14} />
          <Skeleton width="88%" height={36} borderRadius={14} />
          <Skeleton width="66%" height={14} style={{ marginTop: "0.5rem" }} />
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <Skeleton width="52%" height={22} />
          <Skeleton width="28%" height={12} />
          <Skeleton variant="rect" height={180} borderRadius={18} />
          <Skeleton width="88%" height={12} />
          <Skeleton width="95%" height={12} />
          <Skeleton width="90%" height={12} />
          <Skeleton width="76%" height={12} />
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.2rem" }}>
            <Skeleton width={76} height={26} borderRadius={9999} />
            <Skeleton width={64} height={26} borderRadius={9999} />
            <Skeleton width={82} height={26} borderRadius={9999} />
          </div>
        </div>
      </div>
    </PanelFrame>
  );
}
