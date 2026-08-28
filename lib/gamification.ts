export const XP_PER_VALID_REP = 2;
export const XP_UNBROKEN_SET_BONUS = 15;
export const XP_PR_BONUS = 40;
export const XP_STREAK_MILESTONE = [3, 7, 14, 30, 60, 100, 365];

export function xpForWorkout(opts: {
  validReps: number;
  bestSetReps: number;
  previousBestSet: number;
  hasUnbrokenSet: boolean;
}): { xp: number; brokePR: boolean } {
  let xp = opts.validReps * XP_PER_VALID_REP;
  const brokePR = opts.bestSetReps > opts.previousBestSet && opts.previousBestSet > 0;
  if (brokePR) xp += XP_PR_BONUS;
  if (opts.hasUnbrokenSet) xp += XP_UNBROKEN_SET_BONUS;
  return { xp, brokePR };
}

export function levelForXp(totalXp: number): { level: number; xpIntoLevel: number; xpForNextLevel: number } {
  let level = 1;
  let remaining = totalXp;
  let needed = 100;
  while (remaining >= needed) {
    remaining -= needed;
    level += 1;
    needed = Math.round(100 * Math.pow(level, 1.35));
  }
  return { level, xpIntoLevel: remaining, xpForNextLevel: needed };
}

export function nextStreak(lastWorkoutDay: Date | null, today: Date, currentStreak: number, longestStreak: number) {
  const dayMs = 86400000;
  const toDateOnly = (d: Date) => Math.floor(d.getTime() / dayMs);
  const todayIdx = toDateOnly(today);

  if (!lastWorkoutDay) {
    return { currentStreak: 1, longestStreak: Math.max(1, longestStreak) };
  }
  const lastIdx = toDateOnly(lastWorkoutDay);
  const diff = todayIdx - lastIdx;

  if (diff === 0) return { currentStreak, longestStreak };
  if (diff === 1) {
    const updated = currentStreak + 1;
    return { currentStreak: updated, longestStreak: Math.max(updated, longestStreak) };
  }
  return { currentStreak: 1, longestStreak: Math.max(1, longestStreak) };
}

export const BADGE_DEFINITIONS: Record<string, { label: string; description: string }> = {
  first_workout: { label: "First Rep", description: "Completed your first camera-validated workout" },
  century_club: { label: "Century Club", description: "100 total push-ups" },
  thousand_club: { label: "Iron Thousand", description: "1,000 total push-ups" },
  ten_k_club: { label: "Ten-K Legend", description: "10,000 total push-ups" },
  streak_3: { label: "Spark", description: "3-day streak" },
  streak_7: { label: "Ignition", description: "7-day streak" },
  streak_30: { label: "Furnace", description: "30-day streak" },
  streak_100: { label: "Eternal Flame", description: "100-day streak" },
  unbroken_20: { label: "Unbroken 20", description: "20 push-ups in one set, no rest" },
  unbroken_50: { label: "Unbroken 50", description: "50 push-ups in one set, no rest" },
  pr_breaker: { label: "PR Breaker", description: "Beat your personal best set" },
};

export function badgesEarned(opts: {
  isFirstWorkout: boolean;
  totalPushups: number;
  currentStreak: number;
  bestUnbrokenSetThisWorkout: number;
  brokePR: boolean;
  alreadyEarned: Set<string>;
}): string[] {
  const earned: string[] = [];
  const add = (key: string) => {
    if (!opts.alreadyEarned.has(key)) earned.push(key);
  };
  if (opts.isFirstWorkout) add("first_workout");
  if (opts.totalPushups >= 100) add("century_club");
  if (opts.totalPushups >= 1000) add("thousand_club");
  if (opts.totalPushups >= 10000) add("ten_k_club");
  if (opts.currentStreak >= 3) add("streak_3");
  if (opts.currentStreak >= 7) add("streak_7");
  if (opts.currentStreak >= 30) add("streak_30");
  if (opts.currentStreak >= 100) add("streak_100");
  if (opts.bestUnbrokenSetThisWorkout >= 20) add("unbroken_20");
  if (opts.bestUnbrokenSetThisWorkout >= 50) add("unbroken_50");
  if (opts.brokePR) add("pr_breaker");
  return earned;
}
