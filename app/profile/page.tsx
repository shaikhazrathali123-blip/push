import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ProfileClient from "./ProfileClient";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");
  const userId = (session.user as any).id as string;

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { badges: true } });
  const workouts = await prisma.workout.findMany({
    where: { userId },
    orderBy: { startedAt: "desc" },
    take: 30,
  });

  const chartData = [...workouts]
    .reverse()
    .map((w) => ({ date: new Date(w.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }), reps: w.validReps }));

  return (
    <ProfileClient
      user={JSON.parse(JSON.stringify(user))}
      workouts={JSON.parse(JSON.stringify(workouts))}
      chartData={chartData}
    />
  );
}
