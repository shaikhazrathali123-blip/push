import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Incoming pending friend requests for the current user.
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const incoming = await prisma.friendship.findMany({
    where: { addresseeId: userId, status: "PENDING" },
    include: { requester: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ incoming });
}

const RespondSchema = z.object({
  friendshipId: z.string(),
  action: z.enum(["ACCEPT", "DECLINE", "BLOCK"]),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const parsed = RespondSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const friendship = await prisma.friendship.findUnique({ where: { id: parsed.data.friendshipId } });
  if (!friendship || friendship.addresseeId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const statusMap = { ACCEPT: "ACCEPTED", DECLINE: "DECLINED", BLOCK: "BLOCKED" } as const;
  const updated = await prisma.friendship.update({
    where: { id: friendship.id },
    data: { status: statusMap[parsed.data.action], respondedAt: new Date() },
  });

  return NextResponse.json({ friendship: updated });
}
