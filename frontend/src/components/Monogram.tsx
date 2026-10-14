import { symbolHue } from "../lib/format";

export default function Monogram({
  symbol,
  size = 30,
  className = "",
}: {
  symbol: string;
  size?: number;
  className?: string;
}) {
  const label = (symbol || "?").slice(0, 2).toUpperCase();
  return (
    <span
      className={`flex shrink-0 select-none items-center justify-center font-display font-semibold text-paper ${className}`}
      style={{
        width: size,
        height: size,
        background: symbolHue(symbol || "?"),
        fontSize: Math.max(10, size * 0.34),
        letterSpacing: "0.02em",
      }}
    >
      {label}
    </span>
  );
}
