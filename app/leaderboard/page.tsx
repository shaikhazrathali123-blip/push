import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import LeaderboardClient from "./LeaderboardClient";

export default async function LeaderboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");
  return <LeaderboardClient />;
}
