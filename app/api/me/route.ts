import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { levelForXp } from "@/lib/gamification";

function startOfWeek(d: Date) {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7; // Monday = 0
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}
function startOfDay(d: Date) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { badges: true },
  });

  const now = new Date();
  const [todayAgg, weekAgg, monthAgg] = await Promise.all([
    prisma.workout.aggregate({
      where: { userId, cameraValidated: true, startedAt: { gte: startOfDay(now) } },
      _sum: { validReps: true },
    }),
    prisma.workout.aggregate({
      where: { userId, cameraValidated: true, startedAt: { gte: startOfWeek(now) } },
      _sum: { validReps: true },
    }),
    prisma.workout.aggregate({
      where: { userId, cameraValidated: true, startedAt: { gte: startOfMonth(now) } },
      _sum: { validReps: true },
    }),
  ]);

  const { xpIntoLevel, xpForNextLevel } = levelForXp(user.totalXp);

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      image: user.image,
      totalPushups: user.totalPushups,
      totalWorkouts: user.totalWorkouts,
      totalXp: user.totalXp,
      level: user.level,
      xpIntoLevel,
      xpForNextLevel,
      currentStreak: user.currentStreak,
      longestStreak: user.longestStreak,
      bestSetReps: user.bestSetReps,
      badges: user.badges,
    },
    stats: {
      today: todayAgg._sum.validReps ?? 0,
      week: weekAgg._sum.validReps ?? 0,
      month: monthAgg._sum.validReps ?? 0,
    },
  });
}
