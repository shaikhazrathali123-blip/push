export default function StatCard({
  label,
  value,
  unit,
  accent = false,
}: {
  label: string;
  value: string | number;
  unit?: string;
  accent?: boolean;
}) {
  return (
    <div className="card p-4 flex flex-col gap-1">
      <span className="text-ink-500 text-xs font-medium uppercase tracking-wide">{label}</span>
      <span className={`font-display text-2xl font-bold ${accent ? "ember-text" : "text-ink-100"}`}>
        {value}
        {unit && <span className="text-sm text-ink-500 font-body ml-1">{unit}</span>}
      </span>
    </div>
  );
}
