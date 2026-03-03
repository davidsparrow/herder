import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/emails/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-nunito)", "system-ui", "sans-serif"],
        display: ["var(--font-fraunces)", "Georgia", "serif"],
      },
      colors: {
        cream:  { DEFAULT: "#FDF8F3", deep: "#F5EDE0", border: "#EAD9C6" },
        parchment: "#FAF3EA",
        ink:    { DEFAULT: "#2C1810", mid: "#5C3D2E", light: "#8B6355" },
        terra:  { DEFAULT: "#E05C2A", light: "#FBE9E1", dark: "#B8441A" },
        sage:   { DEFAULT: "#4A9E7A", light: "#DFF2EB", dark: "#2D7A5A" },
        gold:   { DEFAULT: "#D4962A", light: "#FEF3DC" },
        blush:  { DEFAULT: "#E8607A", light: "#FDECEF" },
        sky:    { DEFAULT: "#4A8FCC", light: "#E3F0FB" },
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.25rem",
        "4xl": "1.5rem",
      },
      boxShadow: {
        warm:   "0 4px 20px rgba(44,24,16,0.08)",
        "warm-lg": "0 12px 40px rgba(44,24,16,0.14)",
        terra:  "0 4px 16px rgba(224,92,42,0.35)",
        sage:   "0 4px 16px rgba(74,158,122,0.35)",
      },
      animation: {
        "pop-in":   "popIn 0.25s cubic-bezier(0.34,1.56,0.64,1)",
        "float-up": "floatUp 0.5s cubic-bezier(0.22,1,0.36,1) both",
        "check-bounce": "checkBounce 0.35s cubic-bezier(0.34,1.56,0.64,1)",
      },
      keyframes: {
        popIn:       { from: { transform: "scale(0.88) translateY(16px)", opacity: "0" }, to: { transform: "none", opacity: "1" } },
        floatUp:     { from: { opacity: "0", transform: "translateY(22px)" }, to: { opacity: "1", transform: "none" } },
        checkBounce: { "0%": { transform: "scale(1)" }, "50%": { transform: "scale(1.3)" }, "100%": { transform: "scale(1)" } },
      },
    },
  },
  plugins: [],
};
export default config;
