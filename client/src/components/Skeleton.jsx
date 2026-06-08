function toCssSize(value, fallback) {
  if (value == null || value === "") return fallback;
  return typeof value === "number" ? `${value}px` : value;
}

export default function Skeleton({
  width = "100%",
  height,
  borderRadius,
  variant = "text",
  count = 1,
  style = {},
}) {
  const isText = variant === "text";
  const isCircle = variant === "circle";
  const isRect = variant === "rect";
  const resolvedWidth = toCssSize(width, "100%");

  const resolvedHeight = toCssSize(
    height,
    isText ? "14px" : isCircle ? (resolvedWidth === "100%" ? "40px" : resolvedWidth) : "18px"
  );
  const resolvedBorderRadius =
    borderRadius != null
      ? toCssSize(borderRadius, "8px")
      : isCircle
        ? "9999px"
        : isRect
          ? "10px"
          : "8px";

  const items = Array.from({ length: Math.max(1, count) });

  return (
    <div aria-hidden="true" style={{ width: resolvedWidth, ...style }}>
      <style>{`
        @keyframes tablecastSkeletonPulse {
          0%, 100% { opacity: 0.55; }
          50% { opacity: 1; }
        }
      `}</style>
      {items.map((_, index) => (
        <div
          key={index}
          style={{
            width: resolvedWidth,
            height: resolvedHeight,
            borderRadius: resolvedBorderRadius,
            background: "rgba(255,255,255,0.07)",
            backgroundColor: "var(--color-surface)",
            opacity: 0.75,
            animation: "tablecastSkeletonPulse 1.4s ease-in-out infinite",
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04)",
            marginBottom: index === items.length - 1 ? 0 : 6,
            ...(isCircle ? { aspectRatio: "1 / 1" } : null),
          }}
        />
      ))}
    </div>
  );
}
