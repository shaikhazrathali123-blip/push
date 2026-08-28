import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { levelForXp } from "@/lib/gamification";
import StatCard from "@/components/StatCard";
import RingProgress from "@/components/RingProgress";
import Link from "next/link";

function startOfWeek(d: Date) {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}
function startOfDay(d: Date) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
}

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");
  const userId = (session.user as any).id as string;

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const now = new Date();

  const [todayAgg, weekAgg, recentWorkouts] = await Promise.all([
    prisma.workout.aggregate({
      where: { userId, cameraValidated: true, startedAt: { gte: startOfDay(now) } },
      _sum: { validReps: true },
    }),
    prisma.workout.aggregate({
      where: { userId, cameraValidated: true, startedAt: { gte: startOfWeek(now) } },
      _sum: { validReps: true },
    }),
    prisma.workout.findMany({ where: { userId }, orderBy: { startedAt: "desc" }, take: 4 }),
  ]);

  const { xpIntoLevel, xpForNextLevel } = levelForXp(user.totalXp);
  const todayReps = todayAgg._sum.validReps ?? 0;
  const weekReps = weekAgg._sum.validReps ?? 0;

  return (
    <div className="px-5 pt-6 pb-4 flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-ink-500 text-sm">Welcome back,</p>
          <h1 className="font-display text-xl font-bold">{user.name?.split(" ")[0] ?? "Athlete"}</h1>
        </div>
        <div className="flex items-center gap-2 bg-base-850 border border-base-700/60 rounded-full pl-1.5 pr-3 py-1.5">
          <div className="w-7 h-7 rounded-full bg-volt-500/20 flex items-center justify-center text-volt-400 text-xs font-bold">
            🔥
          </div>
          <span className="font-mono text-sm font-medium">{user.currentStreak}d</span>
        </div>
      </header>

      <div className="card p-5 flex items-center gap-5 bg-volt-radial">
        <RingProgress value={xpIntoLevel} max={xpForNextLevel} label={`Lv${user.level}`} sublabel="level" />
        <div className="flex-1">
          <p className="text-ink-500 text-xs uppercase tracking-wide mb-1">Total XP</p>
          <p className="font-display text-2xl font-bold volt-text">{user.totalXp.toLocaleString()}</p>
          <p className="text-ink-500 text-xs mt-1">
            {xpForNextLevel - xpIntoLevel} XP to level {user.level + 1}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Today" value={todayReps} unit="reps" accent={todayReps > 0} />
        <StatCard label="This week" value={weekReps} unit="reps" />
        <StatCard label="Best set" value={user.bestSetReps} unit="reps" />
      </div>

      <Link
        href="/workout"
        className="btn-volt w-full py-4 text-center font-display font-bold text-lg flex items-center justify-center gap-2"
      >
        Start Workout
      </Link>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-semibold text-sm text-ink-300">Recent activity</h2>
          <Link href="/profile" className="text-xs text-volt-500">View all</Link>
        </div>
        <div className="flex flex-col gap-2">
          {recentWorkouts.length === 0 && (
            <div className="card p-5 text-center text-ink-500 text-sm">
              No workouts yet — your first camera-verified set is one tap away.
            </div>
          )}
          {recentWorkouts.map((w) => (
            <div key={w.id} className="card p-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">{w.validReps} reps · best set {w.bestSetReps}</p>
                <p className="text-ink-500 text-xs">{new Date(w.startedAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</p>
              </div>
              <span className="text-volt-500 font-mono text-sm">+{w.xpEarned} XP</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
