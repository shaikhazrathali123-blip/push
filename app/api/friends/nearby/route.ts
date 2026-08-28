import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// "Nearby athletes" is opt-in and coarse: matches by a 5-character geohash
// (city-block resolution), never exact coordinates, and only surfaces users
// who explicitly enabled showNearby.
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const me = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!me.showNearby || !me.geohash) {
    return NextResponse.json({ nearby: [], reason: "Enable 'show nearby' in Profile > Privacy to see nearby athletes." });
  }

  const prefix = me.geohash.slice(0, 4); // ~city-block-ish radius, coarser than full geohash match
  const nearby = await prisma.user.findMany({
    where: {
      id: { not: userId },
      showNearby: true,
      geohash: { startsWith: prefix },
    },
    select: { id: true, name: true, username: true, image: true, level: true, currentStreak: true, city: true },
    take: 25,
  });

  return NextResponse.json({ nearby });
}
