import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import FriendsClient from "./FriendsClient";

export default async function FriendsPage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");
  return <FriendsClient />;
}
