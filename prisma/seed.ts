import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

/**
 * Optional local dev seed: creates a couple of demo users with workout
 * history so Leaderboard/Friends/Challenges have something to show before
 * you've signed in with real Google accounts. Run with `npm run db:seed`.
 */
async function main() {
  const demoUsers = [
    { name: "Ava Torres", username: "avatorres", totalPushups: 4210, bestSetReps: 45, currentStreak: 12, longestStreak: 30, totalXp: 3400, level: 6, region: "CA" },
    { name: "Marcus Lee", username: "marcuslee", totalPushups: 2890, bestSetReps: 38, currentStreak: 5, longestStreak: 21, totalXp: 2200, level: 5, region: "CA" },
    { name: "Priya Nair", username: "priyanair", totalPushups: 6120, bestSetReps: 60, currentStreak: 30, longestStreak: 45, totalXp: 5100, level: 8, region: "NY" },
  ];

  for (const u of demoUsers) {
    await prisma.user.upsert({
      where: { username: u.username },
      update: {},
      create: { ...u, email: `${u.username}@example.com`, showOnLeaderboards: true },
    });
  }
  console.log("Seeded demo users:", demoUsers.map((u) => u.username).join(", "));
}

main().finally(() => prisma.$disconnect());
