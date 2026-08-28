export default function RingProgress({
  value,
  max,
  size = 88,
  strokeWidth = 8,
  label,
  sublabel,
}: {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  label: string;
  sublabel?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(1, max > 0 ? value / max : 0);
  const offset = circumference * (1 - pct);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="#232326" strokeWidth={strokeWidth} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#1A9CFF"
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ filter: "drop-shadow(0 0 2px #1A9CFF", transition: "stroke-dashoffset 400ms ease" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-display font-bold text-lg">{label}</span>
        {sublabel && <span className="text-[10px] text-ink-500">{sublabel}</span>}
      </div>
    </div>
  );
}
