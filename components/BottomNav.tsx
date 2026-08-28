"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Home", icon: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { href: "/leaderboard", label: "Ranks", icon: "M8 20V10M14 20V4M20 20v-7M2 20h20" },
  { href: "/workout", label: "Workout", icon: "PLUS" },
  { href: "/friends", label: "Friends", icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" },
  { href: "/profile", label: "Profile", icon: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" },
];

export default function BottomNav() {
  const pathname = usePathname();
  if (pathname === "/sign-in") return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40">
      <div className="mx-auto max-w-md px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-2">
        <div className="bg-base-900/90 backdrop-blur-xl border border-base-700/60 rounded-full flex items-center justify-between px-2 py-2 shadow-card">
          {ITEMS.map((item) => {
            const active = pathname === item.href;
            if (item.icon === "PLUS") {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="btn-ember w-14 h-14 flex items-center justify-center -mt-6 shrink-0"
                  aria-label="Start workout"
                >
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </Link>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-full transition-colors ${
                  active ? "text-ember-500" : "text-ink-500"
                }`}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={item.icon} />
                </svg>
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
