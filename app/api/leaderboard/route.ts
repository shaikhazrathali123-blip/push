import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function startOfWeek(d: Date) {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Computes leaderboards on read from live, camera-validated data rather than
 * only trusting the materialized LeaderboardEntry table, so the leaderboard
 * page always reflects the true current state. LeaderboardEntry is still
 * written to (see /lib/leaderboard-refresh.ts) for O(1) rank lookups at scale;
 * this route is the straightforward correct version for moderate data volumes.
 *
 * IMPORTANT (anti-cheat): every query below filters on cameraValidated: true —
 * manually logged or physiologically-implausible workouts never affect rank.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const { searchParams } = new URL(req.url);
  const scope = (searchParams.get("scope") ?? "GLOBAL") as "FRIENDS" | "STATE" | "GLOBAL";
  const metric = (searchParams.get("metric") ?? "WEEKLY_REPS") as "WEEKLY_REPS" | "BEST_SET" | "STREAK" | "XP";

  let userFilter: { id: { in: string[] } } | {} = {};

  if (scope === "FRIENDS") {
    const friendships = await prisma.friendship.findMany({
      where: { status: "ACCEPTED", OR: [{ requesterId: userId }, { addresseeId: userId }] },
    });
    const ids = friendships.map((f) => (f.requesterId === userId ? f.addresseeId : f.requesterId));
    ids.push(userId);
    userFilter = { id: { in: ids } };
  } else if (scope === "STATE") {
    const me = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!me.region) return NextResponse.json({ entries: [], reason: "Set your region in Profile to see the state leaderboard." });
    const ids = (await prisma.user.findMany({ where: { region: me.region, showOnLeaderboards: true }, select: { id: true } })).map((u) => u.id);
    userFilter = { id: { in: ids } };
  } else {
    userFilter = { showOnLeaderboards: true };
  }

  let entries: Array<{ id: string; name: string | null; username: string | null; image: string | null; value: number }> = [];

  if (metric === "WEEKLY_REPS") {
    const grouped = await prisma.workout.groupBy({
      by: ["userId"],
      where: { cameraValidated: true, startedAt: { gte: startOfWeek(new Date()) }, user: userFilter as any },
      _sum: { validReps: true },
      orderBy: { _sum: { validReps: "desc" } },
      take: 100,
    });
    const users = await prisma.user.findMany({ where: { id: { in: grouped.map((g) => g.userId) } } });
    const byId = Object.fromEntries(users.map((u) => [u.id, u]));
    entries = grouped
      .filter((g) => byId[g.userId])
      .map((g) => ({ id: g.userId, name: byId[g.userId].name, username: byId[g.userId].username, image: byId[g.userId].image, value: g._sum.validReps ?? 0 }));
  } else {
    const field = metric === "BEST_SET" ? "bestSetReps" : metric === "STREAK" ? "currentStreak" : "totalXp";
    const users = await prisma.user.findMany({
      where: userFilter as any,
      orderBy: { [field]: "desc" },
      take: 100,
    });
    entries = users.map((u) => ({ id: u.id, name: u.name, username: u.username, image: u.image, value: (u as any)[field] }));
  }

  const ranked = entries.map((e, i) => ({ ...e, rank: i + 1, isMe: e.id === userId }));
  return NextResponse.json({ scope, metric, entries: ranked });
}
