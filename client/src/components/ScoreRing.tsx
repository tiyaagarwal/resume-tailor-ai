interface ScoreRingProps {
  score: number; // 0-100
  size?: number;
  label?: string;
}

function tone(score: number): { ring: string; text: string } {
  if (score >= 75) return { ring: '#3C7A54', text: '#3C7A54' }; // approve
  if (score >= 50) return { ring: '#B4732A', text: '#B4732A' }; // seal
  return { ring: '#A6402F', text: '#A6402F' }; // deny
}

export default function ScoreRing({ score, size = 96, label = 'ATS Match' }: ScoreRingProps) {
  const radius = (size - 10) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);
  const { ring, text } = tone(score);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#DAD4C4" strokeWidth={6} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={ring}
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 700ms ease-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-2xl font-semibold" style={{ color: text }}>
            {score}
          </span>
          <span className="text-[9px] font-mono text-ink-faint -mt-0.5">/ 100</span>
        </div>
      </div>
      <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">{label}</span>
    </div>
  );
}
