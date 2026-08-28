import { withAuth } from "next-auth/middleware";

// Protects everything except the marketing/sign-in routes and static/PWA assets.
export default withAuth({
  pages: { signIn: "/sign-in" },
});

export const config = {
  matcher: [
    "/workout/:path*",
    "/leaderboard/:path*",
    "/friends/:path*",
    "/challenges/:path*",
    "/profile/:path*",
    "/api/workouts/:path*",
    "/api/friends/:path*",
    "/api/challenges/:path*",
    "/api/leaderboard/:path*",
    "/api/me/:path*",
  ],
};
