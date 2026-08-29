export default function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2.5 text-ink-soft">
      <span className="relative inline-block h-4 w-4">
        <span className="absolute inset-0 rounded-full border-2 border-line" />
        <span className="absolute inset-0 rounded-full border-2 border-press border-t-transparent animate-spin" />
      </span>
      {label && <span className="text-sm font-mono">{label}</span>}
    </div>
  );
}
