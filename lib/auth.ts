import { NextAuthOptions, getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  trustHost: true,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: { prompt: "select_account", access_type: "offline", response_type: "code" },
      },
    }),
  ],
  pages: { signIn: "/sign-in" },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        const userId = token.id as string;
        (session.user as any).id = userId;
        const dbUser = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            username: true,
            totalXp: true,
            level: true,
            currentStreak: true,
            longestStreak: true,
            totalPushups: true,
            profileVisibility: true,
          },
        });
        Object.assign(session.user as any, dbUser);
      }
      return session;
    },
    async signIn({ user }) {
      if (user?.id) {
        const existing = await prisma.user.findUnique({ where: { id: user.id } });
        if (existing && !existing.username) {
          const base = (existing.name || "athlete").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16);
          const suffix = existing.id.slice(-4);
          await prisma.user.update({
            where: { id: user.id },
            data: { username: `${base || "athlete"}${suffix}` },
          });
        }
      }
      return true;
    },
  },
};

export function auth() {
  return getServerSession(authOptions);
}