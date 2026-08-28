import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username?: string | null;
      totalXp?: number;
      level?: number;
      currentStreak?: number;
      longestStreak?: number;
      totalPushups?: number;
      profileVisibility?: "PUBLIC" | "FRIENDS" | "PRIVATE";
    } & DefaultSession["user"];
  }
}
