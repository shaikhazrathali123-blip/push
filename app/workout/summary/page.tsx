"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import ShareSticker from "@/components/ShareSticker";
import { BADGE_DEFINITIONS } from "@/lib/gamification";

export default function WorkoutSummaryPage() {
  const [result, setResult] = useState<any>(null);
  const [showEditor, setShowEditor] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("pushquest:lastResult");
    if (raw) setResult(JSON.parse(raw));
  }, []);

  if (!result) {
    return (
      <div className="px-5 pt-10 text-center text-ink-500 min-h-screen">
        <p>No recent workout to show.</p>
        <Link href="/" className="text-volt-500 text-sm mt-2 block">Back to Home</Link>
      </div>
    );
  }

  const { workout, xpEarned, currentStreak, longestStreak, badgesEarned: earnedBadges, countsForRanking } = result;

  if (showEditor) {
    return (
      <ShareSticker
        stats={{
          reps: workout.validReps,
          bestSet: workout.bestSetReps,
          durationSec: workout.durationSec,
          xp: xpEarned,
          currentStreak,
          longestStreak,
        }}
        onClose={() => setShowEditor(false)}
      />
    );
  }

  return (
    <div className="px-5 pt-8 flex flex-col gap-6 items-center text-center min-h-screen">
      <div className="w-16 h-16 rounded-full bg-volt-500/15 flex items-center justify-center text-3xl animate-rep-pop">🏁</div>
      <div>
        <h1 className="font-display text-2xl font-bold">Workout Complete</h1>
        {!countsForRanking && (
          <p className="text-ink-500 text-xs mt-1 max-w-xs mx-auto">This session wasn't camera-validated for competitive stats, but it's saved to your history.</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 w-full max-w-md">
        <div className="card p-4"><p className="text-ink-500 text-xs">Total reps</p><p className="font-display text-3xl font-bold volt-text">{workout.validReps}</p></div>
        <div className="card p-4"><p className="text-ink-500 text-xs">Best set</p><p className="font-display text-3xl font-bold">{workout.bestSetReps}</p></div>
        <div className="card p-4"><p className="text-ink-500 text-xs">Duration</p><p className="font-display text-3xl font-bold">{Math.floor(workout.durationSec / 60)}:{String(workout.durationSec % 60).padStart(2, "0")}</p></div>
        <div className="card p-4"><p className="text-ink-500 text-xs">XP earned</p><p className="font-display text-3xl font-bold volt-text">+{xpEarned}</p></div>
      </div>

      <div className="card p-4 w-full max-w-md flex items-center justify-between">
        <div className="text-left">
          <p className="text-ink-500 text-xs">Current streak</p>
          <p className="font-display text-xl font-bold">🔥 {currentStreak} days</p>
        </div>
        <div className="text-right">
          <p className="text-ink-500 text-xs">Longest streak</p>
          <p className="font-display text-xl font-bold">{longestStreak} days</p>
        </div>
      </div>

      {earnedBadges?.length > 0 && (
        <div className="w-full max-w-md">
          <p className="text-ink-500 text-xs uppercase tracking-wide mb-2 text-left">New badges</p>
          <div className="flex gap-2 flex-wrap justify-start">
            {earnedBadges.map((key: string) => (
              <div key={key} className="card px-3 py-2 flex items-center gap-2 border-volt-500/40">
                <span className="text-lg">🏅</span>
                <span className="text-xs font-medium">{BADGE_DEFINITIONS[key]?.label ?? key}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={() => setShowEditor(true)} className="btn-volt w-full max-w-md py-4 font-display font-bold mt-auto mb-6">
        Create Share Sticker
      </button>
      <Link href="/" className="text-ink-500 text-sm py-2 mb-8">Back to Home</Link>
    </div>
  );
}