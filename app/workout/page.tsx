import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import WorkoutClient from "./WorkoutClient";

export default async function WorkoutPage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");
  return <WorkoutClient />;
}
