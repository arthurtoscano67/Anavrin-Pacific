import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#0a0a14",
        surface: "#12121f",
        borderSoft: "rgba(255,255,255,0.08)",
        purple: "#8b5cf6",
        cyan: "#06b6d4",
        legendGold: "#fbbf24",
        stageEgg: "#8b5cf6",
        stageBaby: "#22c55e",
        stageAdult: "#3b82f6",
        stageLegend: "#fbbf24",
      },
      boxShadow: {
        card: "0 10px 30px rgba(0,0,0,0.35)",
        glow: "0 0 24px rgba(139, 92, 246, 0.28)",
      },
      fontFamily: {
        inter: ["Inter", "sans-serif"],
      },
      transitionTimingFunction: {
        outExpo: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
