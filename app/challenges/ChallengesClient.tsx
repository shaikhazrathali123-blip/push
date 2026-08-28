"use client";
import { useEffect, useState } from "react";

const TEMPLATES = [
  { type: "DAILY_TARGET", label: "50 Today", targetReps: 50, icon: "☀️" },
  { type: "WEEKLY_TARGET", label: "500 This Week", targetReps: 500, icon: "📅" },
  { type: "UNBROKEN_SET", label: "20 Unbroken", targetReps: 20, icon: "⚡" },
  { type: "BEAT_PR", label: "Beat Your PR", icon: "🏆" },
];

export default function ChallengesClient() {
  const [challenges, setChallenges] = useState<any[]>([]);
  const [creating, setCreating] = useState<string | null>(null);

  const load = () => fetch("/api/challenges").then((r) => r.json()).then((d) => setChallenges(d.challenges ?? []));
  useEffect(() => { load(); }, []);

  const create = async (type: string, targetReps?: number) => {
    setCreating(type);
    await fetch("/api/challenges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, targetReps }),
    });
    setCreating(null);
    load();
  };

  const active = challenges.filter((c) => c.status === "ACTIVE");
  const completed = challenges.filter((c) => c.status === "COMPLETED");

  return (
    <div className="px-5 pt-6 pb-4 flex flex-col gap-6">
      <h1 className="font-display text-2xl font-bold">Challenges</h1>

      <section>
        <h2 className="font-display font-semibold text-sm text-ink-300 mb-3">Start a challenge</h2>
        <div className="grid grid-cols-2 gap-2.5">
          {TEMPLATES.map((t) => (
            <button
              key={t.type}
              onClick={() => create(t.type, t.targetReps)}
              disabled={creating === t.type}
              className="card p-4 flex flex-col items-start gap-2 text-left active:scale-[0.98] transition-transform"
            >
              <span className="text-2xl">{t.icon}</span>
              <span className="text-sm font-semibold">{creating === t.type ? "Starting…" : t.label}</span>
            </button>
          ))}
        </div>
        <p className="text-ink-700 text-xs mt-2">1v1 friend duels can be started from a friend's profile.</p>
      </section>

      <section>
        <h2 className="font-display font-semibold text-sm text-ink-300 mb-3">Active ({active.length})</h2>
        <div className="flex flex-col gap-2">
          {active.length === 0 && <p className="text-ink-500 text-sm">No active challenges — pick one above to get going.</p>}
          {active.map((c) => {
            const target = c.challenge.targetReps ?? 1;
            const pct = Math.min(100, Math.round((c.progress / target) * 100));
            return (
              <div key={c.id} className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold">{c.challenge.title}</p>
                  <span className="text-xs text-volt-500 font-mono">+{c.challenge.xpReward} XP</span>
                </div>
                <div className="h-2 bg-base-700 rounded-full overflow-hidden">
                  <div className="h-full bg-volt-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-xs text-ink-500 mt-1.5">{c.progress} / {target} reps</p>
              </div>
            );
          })}
        </div>
      </section>

      {completed.length > 0 && (
        <section>
          <h2 className="font-display font-semibold text-sm text-ink-300 mb-3">Completed</h2>
          <div className="flex flex-col gap-2">
            {completed.map((c) => (
              <div key={c.id} className="card p-4 flex items-center justify-between border-emerald-500/30">
                <p className="text-sm font-semibold">{c.challenge.title}</p>
                <span className="text-emerald-400 text-xs">✓ Done</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
