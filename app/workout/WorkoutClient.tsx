"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePushupCamera, LiveRepEvent } from "@/hooks/usePushupCamera";

type SetRecord = {
  setNumber: number;
  reps: number;
  unbroken: boolean;
  restAfterSec?: number;
  avgTempoMs?: number;
  formScore?: number;
};

const REST_BREACH_MS = 3000; // gap between reps beyond this ends the "unbroken" streak within a set

export default function WorkoutClient() {
  const router = useRouter();
  const [phase, setPhase] = useState<"setup" | "active" | "resting" | "finished">("setup");
  const [currentSetReps, setCurrentSetReps] = useState(0);
  const [currentSetUnbroken, setCurrentSetUnbroken] = useState(true);
  const [repFormScores, setRepFormScores] = useState<number[]>([]);
  const [invalidReps, setInvalidReps] = useState(0);
  const [sets, setSets] = useState<SetRecord[]>([]);
  const [restSecondsLeft, setRestSecondsLeft] = useState(0);
  const [flashRep, setFlashRep] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const workoutStartedAt = useRef<string | null>(null);
  const lastRepAt = useRef<number>(0);
  const restTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleRep = useCallback((rep: LiveRepEvent) => {
    if (!rep.valid) {
      setInvalidReps((n) => n + 1);
      return;
    }
    const now = performance.now();
    if (lastRepAt.current && now - lastRepAt.current > REST_BREACH_MS) {
      setCurrentSetUnbroken(false);
    }
    lastRepAt.current = now;
    setCurrentSetReps((n) => n + 1);
    setRepFormScores((arr) => [...arr, rep.formScore]);
    setFlashRep(true);
    setTimeout(() => setFlashRep(false), 220);
    if (navigator.vibrate) navigator.vibrate(30);
  }, []);

  const { videoRef, canvasRef, start, stop, status, error, liveState, liveConfidence } = usePushupCamera({
    onRep: handleRep,
  });

  const beginWorkout = async () => {
    workoutStartedAt.current = new Date().toISOString();
    setPhase("active");
    await start();
  };

  const endCurrentSet = () => {
    if (currentSetReps === 0) return;
    const avgForm = repFormScores.length ? repFormScores.reduce((a, b) => a + b, 0) / repFormScores.length : undefined;
    setSets((s) => [
      ...s,
      { setNumber: s.length + 1, reps: currentSetReps, unbroken: currentSetUnbroken, formScore: avgForm },
    ]);
    setCurrentSetReps(0);
    setCurrentSetUnbroken(true);
    setRepFormScores([]);
    lastRepAt.current = 0;
    startRest(90);
  };

  const startRest = (seconds: number) => {
    setPhase("resting");
    setRestSecondsLeft(seconds);
    if (restTimerRef.current) clearInterval(restTimerRef.current);
    restTimerRef.current = setInterval(() => {
      setRestSecondsLeft((s) => {
        if (s <= 1) {
          if (restTimerRef.current) clearInterval(restTimerRef.current);
          setPhase("active");
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const skipRest = () => {
    if (restTimerRef.current) clearInterval(restTimerRef.current);
    setPhase("active");
    setRestSecondsLeft(0);
  };

  const finishWorkout = async () => {
    // Fold any in-progress set into the final tally.
    let finalSets = sets;
    if (currentSetReps > 0) {
      const avgForm = repFormScores.length ? repFormScores.reduce((a, b) => a + b, 0) / repFormScores.length : undefined;
      finalSets = [...sets, { setNumber: sets.length + 1, reps: currentSetReps, unbroken: currentSetUnbroken, formScore: avgForm }];
    }
    stop();
    setSubmitting(true);
    const finishedAt = new Date().toISOString();
    const startedAt = workoutStartedAt.current ?? finishedAt;
    const durationSec = Math.max(1, Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000));
    const avgFormScore = finalSets.length
      ? finalSets.reduce((sum, s) => sum + (s.formScore ?? 0), 0) / finalSets.length
      : undefined;

    try {
      const res = await fetch("/api/workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startedAt,
          finishedAt,
          durationSec,
          sets: finalSets.map((s) => ({ ...s, avgTempoMs: undefined })),
          cameraValidated: true,
          avgFormScore,
          invalidReps,
          deviceInfo: navigator.userAgent.slice(0, 180),
        }),
      });
      if (!res.ok) throw new Error("Failed to save workout");
      const data = await res.json();
      sessionStorage.setItem("pushquest:lastResult", JSON.stringify({ ...data, sets: finalSets }));
      router.push("/workout/summary");
    } catch (e) {
      setSubmitting(false);
      alert("Couldn't save your workout — check your connection and try again.");
    }
  };

  const totalRepsSoFar = useMemo(() => sets.reduce((a, s) => a + s.reps, 0) + currentSetReps, [sets, currentSetReps]);

  if (phase === "setup") {
    return (
      <div className="px-5 pt-10 flex flex-col items-center gap-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-volt-500/15 flex items-center justify-center text-4xl">💪</div>
        <div>
          <h1 className="font-display text-2xl font-bold mb-2">Ready to grind?</h1>
          <p className="text-ink-500 text-sm max-w-xs">
            Set your phone up so your full body is in frame, side-on or 3/4 angle works best. We'll count only reps that hit full depth and lockout.
          </p>
        </div>
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <button onClick={beginWorkout} className="btn-volt w-full max-w-xs py-4 font-display font-bold text-lg">
          {status === "requesting" || status === "loading-model" ? "Loading camera & model…" : "Open Camera"}
        </button>
        <p className="text-ink-700 text-xs max-w-xs">Camera video is processed on your device only and never uploaded.</p>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-[calc(100dvh-6rem)]">
      <div className="relative flex-1 bg-black overflow-hidden">
        <video ref={videoRef} playsInline muted className="w-full h-full object-cover -scale-x-100" />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full -scale-x-100" />

        {/* Top HUD */}
        <div className="absolute top-0 left-0 right-0 p-4 flex items-start justify-between bg-gradient-to-b from-black/70 to-transparent">
          <button onClick={() => { stop(); router.back(); }} className="w-9 h-9 rounded-full bg-black/50 flex items-center justify-center">
            ✕
          </button>
          <div className="flex flex-col items-center">
            <span className="text-[10px] uppercase tracking-wide text-ink-300">State</span>
            <span className="text-xs font-mono text-volt-400">{liveState.replace("_", " ")}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-wide text-ink-300">Tracking</span>
            <span className={`text-xs font-mono ${liveConfidence > 0.5 ? "text-emerald-400" : "text-red-400"}`}>
              {liveConfidence > 0.5 ? "Good" : "Adjust position"}
            </span>
          </div>
        </div>

        {/* Rep counter */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {phase === "active" && (
            <div className={`font-display text-8xl font-bold text-white drop-shadow-[0_0_30px_rgba(255,107,26,0.8)] ${flashRep ? "animate-rep-pop" : ""}`}>
              {currentSetReps}
            </div>
          )}
          {phase === "resting" && (
            <div className="flex flex-col items-center gap-2">
              <span className="text-ink-300 text-sm uppercase tracking-widest">Rest</span>
              <div className="font-display text-7xl font-bold volt-text">{restSecondsLeft}</div>
            </div>
          )}
        </div>

        <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-xs text-ink-300 font-mono">
          <span>Set {sets.length + 1}</span>
          <span>{totalRepsSoFar} total reps</span>
        </div>
      </div>

      <div className="p-4 flex gap-3 bg-base-950">
        {phase === "active" && (
          <>
            <button onClick={endCurrentSet} disabled={currentSetReps === 0} className="btn-ghost flex-1 py-3.5 font-semibold disabled:opacity-40">
              End Set &amp; Rest
            </button>
            <button onClick={finishWorkout} disabled={submitting} className="btn-volt flex-1 py-3.5 font-semibold">
              {submitting ? "Saving…" : "Finish"}
            </button>
          </>
        )}
        {phase === "resting" && (
          <>
            <button onClick={skipRest} className="btn-ghost flex-1 py-3.5 font-semibold">Skip Rest</button>
            <button onClick={finishWorkout} disabled={submitting} className="btn-volt flex-1 py-3.5 font-semibold">
              {submitting ? "Saving…" : "Finish"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
