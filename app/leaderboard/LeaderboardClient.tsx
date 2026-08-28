"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

const SCOPES = [
  { key: "FRIENDS", label: "Friends" },
  { key: "STATE", label: "State" },
  { key: "GLOBAL", label: "Global" },
];
const METRICS = [
  { key: "WEEKLY_REPS", label: "Weekly Reps" },
  { key: "BEST_SET", label: "Best Set" },
  { key: "STREAK", label: "Streak" },
  { key: "XP", label: "XP" },
];

export default function LeaderboardClient() {
  const [scope, setScope] = useState("GLOBAL");
  const [metric, setMetric] = useState("WEEKLY_REPS");
  const [entries, setEntries] = useState<any[]>([]);
  const [reason, setReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/leaderboard?scope=${scope}&metric=${metric}`)
      .then((r) => r.json())
      .then((d) => {
        setEntries(d.entries ?? []);
        setReason(d.reason ?? null);
      })
      .finally(() => setLoading(false));
  }, [scope, metric]);

  const unit = metric === "STREAK" ? "d" : metric === "XP" ? "xp" : "";

  return (
    <div className="px-5 pt-6 pb-4 flex flex-col gap-4">
      <h1 className="font-display text-2xl font-bold">Leaderboard</h1>

      <div className="flex bg-base-850 border border-base-700/60 rounded-full p-1">
        {SCOPES.map((s) => (
          <button
            key={s.key}
            onClick={() => setScope(s.key)}
            className={`flex-1 py-2 rounded-full text-xs font-semibold transition-colors ${scope === s.key ? "bg-ember-500 text-base-950" : "text-ink-300"}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => setMetric(m.key)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border ${
              metric === m.key ? "bg-ember-500/15 border-ember-500 text-ember-400" : "border-base-700 text-ink-500"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-ink-500 text-sm text-center py-8">Loading ranks…</p>}
      {!loading && reason && <p className="text-ink-500 text-sm text-center py-8">{reason}</p>}
      {!loading && !reason && entries.length === 0 && (
        <p className="text-ink-500 text-sm text-center py-8">No ranked activity yet this period.</p>
      )}

      <div className="flex flex-col gap-2">
        {entries.map((e) => (
          <div
            key={e.id}
            className={`card p-3.5 flex items-center gap-3 ${e.isMe ? "border-ember-500/50 bg-ember-500/5" : ""}`}
          >
            <span className={`w-7 text-center font-mono text-sm ${e.rank <= 3 ? "text-ember-400 font-bold" : "text-ink-500"}`}>
              {e.rank}
            </span>
            <div className="w-9 h-9 rounded-full bg-base-700 overflow-hidden flex items-center justify-center text-xs font-bold shrink-0">
              {e.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={e.image} alt="" className="w-full h-full object-cover" />
              ) : (
                (e.name ?? "?")[0]
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{e.name ?? e.username}</p>
            </div>
            <span className="font-mono text-sm text-ink-100">{e.value.toLocaleString()}{unit}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
