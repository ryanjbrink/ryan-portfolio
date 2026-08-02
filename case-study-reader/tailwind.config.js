/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      maxWidth: {
        reader: "42rem",
      },
      boxShadow: {
        glass:
          "0 0 0 1px rgba(255,255,255,0.08), 0 25px 50px -12px rgba(0,0,0,0.45), inset 0 1px 0 0 rgba(255,255,255,0.06)",
        "glass-inner": "inset 0 1px 0 0 rgba(255,255,255,0.12)",
      },
      keyframes: {
        "reader-enter": {
          "0%": { opacity: "0", transform: "scale(0.96) translateY(8px)" },
          "100%": { opacity: "1", transform: "scale(1) translateY(0)" },
        },
        "backdrop-enter": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        shimmer: {
          "0%": { transform: "translateX(-120%) skewX(-12deg)" },
          "100%": { transform: "translateX(120%) skewX(-12deg)" },
        },
      },
      animation: {
        "reader-enter": "reader-enter 280ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "backdrop-enter": "backdrop-enter 240ms ease-out forwards",
        shimmer: "shimmer 4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
