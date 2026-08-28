import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import ChallengesClient from "./ChallengesClient";

export default async function ChallengesPage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");
  return <ChallengesClient />;
}
