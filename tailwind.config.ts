import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: {
          950: "#0a0a0b",
          900: "#0f0f11",
          850: "#141416",
          800: "#1a1a1d",
          700: "#232326",
          600: "#2e2e32",
        },
        ink: {
          100: "#f5f5f4",
          300: "#c7c7c9",
          500: "#8b8b8f",
          700: "#55555a",
        },
        volt: {
          400: "#3dd6ff",
          500: "#1ac1ff",
          600: "#0ca8e8",
          glow: "rgba(26,193,255,0.35)",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      boxShadow: {
        volt: "0 0 24px 0 rgba(26,193,255,0.35)",
        "volt-sm": "0 0 12px 0 rgba(26,193,255,0.25)",
        card: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 8px 24px -12px rgba(0,0,0,0.6)",
      },
      backgroundImage: {
        "volt-radial": "radial-gradient(circle at 50% 0%, rgba(26,193,255,0.12), transparent 60%)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4,0,0.6,1) infinite",
        "rep-pop": "rep-pop 220ms ease-out",
      },
      keyframes: {
        "rep-pop": {
          "0%": { transform: "scale(0.7)", opacity: "0" },
          "60%": { transform: "scale(1.15)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
export default config;