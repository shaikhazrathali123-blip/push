import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { xpForWorkout, levelForXp, nextStreak, badgesEarned } from "@/lib/gamification";

// Each set the client reports is the *aggregated result of the on-device state
// machine*, not raw camera frames — reps here have already passed the
// depth/extension/alignment checks in lib/pushup-detector.ts. We still re-validate
// shape and sane bounds server-side so a tampered client can't inject fake reps.
const SetSchema = z.object({
  setNumber: z.number().int().min(1),
  reps: z.number().int().min(0).max(300),
  unbroken: z.boolean(),
  restAfterSec: z.number().int().min(0).max(3600).optional(),
  avgTempoMs: z.number().int().min(200).max(20000).optional(),
  formScore: z.number().min(0).max(1).optional(),
});

const WorkoutSchema = z.object({
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  durationSec: z.number().int().min(1).max(14400),
  sets: z.array(SetSchema).min(1).max(50),
  cameraValidated: z.boolean(), // false = user manually logged; never touches ranked stats
  avgFormScore: z.number().min(0).max(1).optional(),
  invalidReps: z.number().int().min(0).max(1000).default(0),
  deviceInfo: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const body = await req.json();
  const parsed = WorkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid workout payload", issues: parsed.error.issues }, { status: 400 });
  }
  const input = parsed.data;

  const totalReps = input.sets.reduce((sum, s) => sum + s.reps, 0);
  const bestSetReps = Math.max(0, ...input.sets.map((s) => s.reps));
  const hasUnbrokenSet = input.sets.some((s) => s.unbroken && s.reps >= 20);

  // Sanity guard: even camera-validated workouts can't exceed a physiologically
  // plausible rate. Anything faster gets flagged and demoted to non-competitive.
  const impliedRepsPerSec = totalReps / Math.max(1, input.durationSec);
  const physiologicallyPlausible = impliedRepsPerSec <= 2.5; // ~150 reps/min ceiling
  const countsForRanking = input.cameraValidated && physiologicallyPlausible;

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const { xp, brokePR } = countsForRanking
    ? xpForWorkout({
        validReps: totalReps,
        bestSetReps,
        previousBestSet: user.bestSetReps,
        hasUnbrokenSet,
      })
    : { xp: 0, brokePR: false };

  const today = new Date();
  const streak = countsForRanking
    ? nextStreak(user.lastWorkoutDay, today, user.currentStreak, user.longestStreak)
    : { currentStreak: user.currentStreak, longestStreak: user.longestStreak };

  const newTotalXp = user.totalXp + xp;
  const { level } = levelForXp(newTotalXp);

  const existingBadgeKeys = new Set<string>(
    (await prisma.userBadge.findMany({ where: { userId }, select: { badgeKey: true } })).map((b: { badgeKey: string }) => b.badgeKey)
  );
  const earnedBadgeKeys = countsForRanking
    ? badgesEarned({
        isFirstWorkout: user.totalWorkouts === 0,
        totalPushups: user.totalPushups + totalReps,
        currentStreak: streak.currentStreak,
        bestUnbrokenSetThisWorkout: Math.max(0, ...input.sets.filter((s) => s.unbroken).map((s) => s.reps)),
        brokePR,
        alreadyEarned: existingBadgeKeys,
      })
    : [];

  const workout = await prisma.$transaction(async (tx) => {
    const created = await tx.workout.create({
      data: {
        userId,
        startedAt: new Date(input.startedAt),
        finishedAt: new Date(input.finishedAt),
        durationSec: input.durationSec,
        totalReps,
        validReps: countsForRanking ? totalReps : 0,
        invalidReps: input.invalidReps,
        bestSetReps,
        xpEarned: xp,
        cameraValidated: countsForRanking,
        avgFormScore: input.avgFormScore,
        deviceInfo: input.deviceInfo,
        sets: { create: input.sets },
      },
      include: { sets: true },
    });

    await tx.user.update({
      where: { id: userId },
      data: {
        totalPushups: countsForRanking ? { increment: totalReps } : undefined,
        totalWorkouts: { increment: 1 },
        totalXp: newTotalXp,
        level,
        currentStreak: streak.currentStreak,
        longestStreak: streak.longestStreak,
        lastWorkoutDay: countsForRanking ? today : user.lastWorkoutDay,
        bestSetReps: Math.max(user.bestSetReps, countsForRanking ? bestSetReps : 0),
      },
    });

    if (earnedBadgeKeys.length) {
      await tx.userBadge.createMany({
        data: earnedBadgeKeys.map((badgeKey) => ({ userId, badgeKey })),
        skipDuplicates: true,
      });
    }

    // Progress any active challenges this workout contributes to.
    if (countsForRanking) {
      const activeParticipants = await tx.challengeParticipant.findMany({
        where: { userId, status: "ACTIVE" },
        include: { challenge: true },
      });
      for (const p of activeParticipants) {
        if (p.challenge.endsAt && p.challenge.endsAt < today) continue;
        const newProgress = p.progress + totalReps;
        const target = p.challenge.targetReps ?? Infinity;
        await tx.challengeParticipant.update({
          where: { id: p.id },
          data: {
            progress: newProgress,
            status: newProgress >= target ? "COMPLETED" : "ACTIVE",
            completedAt: newProgress >= target ? today : null,
          },
        });
      }
    }

    return created;
  });

  return NextResponse.json({
    workout,
    xpEarned: xp,
    brokePR,
    newLevel: level,
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    badgesEarned: earnedBadgeKeys,
    countsForRanking,
  });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(100, Number(searchParams.get("limit") ?? 20));

  const workouts = await prisma.workout.findMany({
    where: { userId },
    orderBy: { startedAt: "desc" },
    take: limit,
    include: { sets: true },
  });

  return NextResponse.json({ workouts });
}
