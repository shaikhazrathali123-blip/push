"use client";
import { signIn } from "next-auth/react";

export default function SignInPage() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-8 text-center gap-8">
      <div>
        <div className="text-5xl font-display font-bold tracking-tight mb-2">
          Push<span className="ember-text">Quest</span>
        </div>
        <p className="text-ink-500 text-sm max-w-xs mx-auto">
          Every rep, camera-verified. Track push-ups, build streaks, and climb the leaderboard for real.
        </p>
      </div>

      <button
        onClick={() => signIn("google", { callbackUrl: "/" })}
        className="btn-ember w-full max-w-xs py-3.5 flex items-center justify-center gap-3"
      >
        <svg width="18" height="18" viewBox="0 0 18 18">
          <path fill="#0a0a0b" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.87 2.7-6.62z"/>
          <path fill="#0a0a0b" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.9v2.33A9 9 0 0 0 9 18z"/>
          <path fill="#0a0a0b" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.9A9 9 0 0 0 0 9c0 1.45.35 2.83.9 4.03l3.05-2.33z"/>
          <path fill="#0a0a0b" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .9 4.97l3.05 2.33C4.66 5.17 6.65 3.58 9 3.58z"/>
        </svg>
        Continue with Google
      </button>

      <p className="text-ink-700 text-xs max-w-xs">
        By continuing you agree to camera access being used on-device only for rep counting — no video ever leaves your phone.
      </p>
    </div>
  );
}
