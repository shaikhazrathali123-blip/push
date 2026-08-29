"use client";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { LineChart, Line, XAxis, ResponsiveContainer, Tooltip } from "recharts";
import { BADGE_DEFINITIONS, levelForXp } from "@/lib/gamification";

export default function ProfileClient({ user, workouts, chartData }: { user: any; workouts: any[]; chartData: any[] }) {
  const [showOnLeaderboards, setShowOnLeaderboards] = useState(user.showOnLeaderboards);
  const [showNearby, setShowNearby] = useState(user.showNearby);
  const [saving, setSaving] = useState(false);
  const { xpIntoLevel, xpForNextLevel } = levelForXp(user.totalXp);

  const savePrivacy = async (patch: Partial<{ showOnLeaderboards: boolean; showNearby: boolean }>) => {
    setSaving(true);
    await fetch("/api/me/privacy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => {});
    setSaving(false);
  };

  useEffect(() => {
    console.log("User data:", user);
  }, [user]);

  return (
    <div className="px-5 pt-6 pb-4 flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-base-700 overflow-hidden shrink-0 border-2 border-volt-500/50">
          {user.image && <img src={user.image} alt="" className="w-full h-full object-cover" />}
        </div>
        <div>
          <h1 className="font-display text-xl font-bold">{user.name}</h1>
          <p className="text-ink-500 text-sm">@{user.username} · Level {user.level}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4"><p className="text-ink-500 text-xs">Total push-ups</p><p className="font-display text-2xl font-bold volt-text">{user.totalPushups.toLocaleString()}</p></div>
        <div className="card p-4"><p className="text-ink-500 text-xs">Best set (PR)</p><p className="font-display text-2xl font-bold">{user.bestSetReps}</p></div>
        <div className="card p-4"><p className="text-ink-500 text-xs">Current streak</p><p className="font-display text-2xl font-bold">🔥 {user.currentStreak}d</p></div>
        <div className="card p-4"><p className="text-ink-500 text-xs">Longest streak</p><p className="font-display text-2xl font-bold">{user.longestStreak}d</p></div>
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-ink-500 text-xs uppercase tracking-wide">XP Progress</p>
          <p className="text-xs text-volt-500 font-mono">{xpIntoLevel}/{xpForNextLevel}</p>
        </div>
        <div className="h-2 bg-base-700 rounded-full overflow-hidden">
          <div className="h-full bg-volt-500 rounded-full" style={{ width: `${Math.min(100, (xpIntoLevel / xpForNextLevel) * 100)}%` }} />
        </div>
      </div>

      {chartData.length > 1 && (
        <div className="card p-4">
          <p className="text-ink-500 text-xs uppercase tracking-wide mb-2">Reps over time</p>
          <div style={{ width: "100%", height: 140 }}>
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#8b8b8f" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#141416", border: "1px solid #232326", borderRadius: 12, fontSize: 12 }} />
                <Line type="monotone" dataKey="reps" stroke="#ff6b1a" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <section>
        <h2 className="font-display font-semibold text-sm text-ink-300 mb-3">Badges ({user.badges.length})</h2>
        <div className="grid grid-cols-3 gap-2.5">
          {user.badges.map((b: any) => (
            <div key={b.id} className="card p-3 flex flex-col items-center text-center gap-1">
              <span className="text-2xl">🏅</span>
              <span className="text-[11px] font-medium leading-tight">{BADGE_DEFINITIONS[b.badgeKey]?.label ?? b.badgeKey}</span>
            </div>
          ))}
          {user.badges.length === 0 && <p className="text-ink-500 text-sm col-span-3">No badges yet — finish a workout to start earning them.</p>}
        </div>
      </section>

      <section>
        <h2 className="font-display font-semibold text-sm text-ink-300 mb-3">Workout history</h2>
        <div className="flex flex-col gap-2">
          {workouts.map((w) => (
            <div key={w.id} className="card p-3.5 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{w.validReps} reps · best {w.bestSetReps}</p>
                <p className="text-xs text-ink-500">{new Date(w.startedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
              </div>
              <span className="text-volt-500 font-mono text-sm">+{w.xpEarned} XP</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display font-semibold text-sm text-ink-300 mb-3">Privacy</h2>
        <div className="card divide-y divide-base-700/60">
          <label className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-medium">Show on leaderboards</p>
              <p className="text-xs text-ink-500">Appear in State &amp; Global rankings</p>
            </div>
            <input
              type="checkbox"
              checked={showOnLeaderboards}
              onChange={(e) => { setShowOnLeaderboards(e.target.checked); savePrivacy({ showOnLeaderboards: e.target.checked }); }}
              className="w-5 h-5 accent-volt-500"
            />
          </label>
          <label className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-medium">Show as nearby athlete</p>
              <p className="text-xs text-ink-500">City-level location only, never exact GPS</p>
            </div>
            <input
              type="checkbox"
              checked={showNearby}
              onChange={(e) => { setShowNearby(e.target.checked); savePrivacy({ showNearby: e.target.checked }); }}
              className="w-5 h-5 accent-volt-500"
            />
          </label>
        </div>
        {saving && <p className="text-xs text-ink-700 mt-1">Saving…</p>}
      </section>

      <button onClick={() => signOut({ callbackUrl: "/sign-in" })} className="btn-ghost w-full py-3.5 text-sm font-medium text-ink-300">
        Sign out
      </button>
    </div>
  );
}
