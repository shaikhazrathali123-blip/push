import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// List accepted friends, with each friend's recent-activity snippet (Strava-style).
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const friendships = await prisma.friendship.findMany({
    where: {
      status: "ACCEPTED",
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    include: { requester: true, addressee: true },
  });

  const friends = await Promise.all(
    friendships.map(async (f) => {
      const friend = f.requesterId === userId ? f.addressee : f.requester;
      const lastWorkout = await prisma.workout.findFirst({
        where: { userId: friend.id, cameraValidated: true },
        orderBy: { startedAt: "desc" },
      });
      return {
        id: friend.id,
        name: friend.name,
        username: friend.username,
        image: friend.image,
        level: friend.level,
        currentStreak: friend.currentStreak,
        totalPushups: friend.totalPushups,
        lastWorkout: lastWorkout
          ? { reps: lastWorkout.validReps, at: lastWorkout.startedAt, bestSet: lastWorkout.bestSetReps }
          : null,
      };
    })
  );

  return NextResponse.json({ friends });
}

const RequestSchema = z.object({ targetUsername: z.string().min(2).max(32) });

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const parsed = RequestSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { username: parsed.data.targetUsername } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (target.id === userId) return NextResponse.json({ error: "Can't friend yourself" }, { status: 400 });

  const friendship = await prisma.friendship.upsert({
    where: { requesterId_addresseeId: { requesterId: userId, addresseeId: target.id } },
    update: {},
    create: { requesterId: userId, addresseeId: target.id, status: "PENDING" },
  });

  return NextResponse.json({ friendship });
}
