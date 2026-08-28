import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const participations = await prisma.challengeParticipant.findMany({
    where: { userId },
    include: { challenge: { include: { createdBy: true } } },
    orderBy: { challenge: { startsAt: "desc" } },
  });

  return NextResponse.json({ challenges: participations });
}

const CreateSchema = z.object({
  type: z.enum(["DAILY_TARGET", "WEEKLY_TARGET", "UNBROKEN_SET", "BEAT_PR", "ONE_V_ONE"]),
  targetReps: z.number().int().min(1).max(5000).optional(),
  opponentUsername: z.string().optional(),
});

const TEMPLATES: Record<string, { title: (n?: number) => string; xpReward: number; durationHours: number }> = {
  DAILY_TARGET: { title: (n) => `${n ?? 50} Today`, xpReward: 40, durationHours: 24 },
  WEEKLY_TARGET: { title: (n) => `${n ?? 500} This Week`, xpReward: 150, durationHours: 24 * 7 },
  UNBROKEN_SET: { title: (n) => `${n ?? 20} Unbroken`, xpReward: 60, durationHours: 24 * 7 },
  BEAT_PR: { title: () => "Beat Your PR", xpReward: 80, durationHours: 24 * 7 },
  ONE_V_ONE: { title: () => "1v1 Push-up Duel", xpReward: 100, durationHours: 24 * 3 },
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const parsed = CreateSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { type, targetReps, opponentUsername } = parsed.data;

  const template = TEMPLATES[type];
  const now = new Date();
  const endsAt = new Date(now.getTime() + template.durationHours * 3600 * 1000);

  let resolvedTarget = targetReps;
  if (type === "BEAT_PR") {
    const me = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    resolvedTarget = me.bestSetReps + 1;
  }

  const challenge = await prisma.challenge.create({
    data: {
      type,
      title: template.title(targetReps),
      targetReps: resolvedTarget,
      createdById: userId,
      endsAt,
      xpReward: template.xpReward,
      participants: { create: { userId } },
    },
  });

  if (type === "ONE_V_ONE" && opponentUsername) {
    const opponent = await prisma.user.findUnique({ where: { username: opponentUsername } });
    if (opponent) {
      await prisma.challengeParticipant.create({
        data: { challengeId: challenge.id, userId: opponent.id, opponentId: userId },
      });
      await prisma.challengeParticipant.update({
        where: { challengeId_userId: { challengeId: challenge.id, userId } },
        data: { opponentId: opponent.id },
      });
    }
  }

  return NextResponse.json({ challenge });
}
