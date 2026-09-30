/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#f8fafc",
        line: "#e2e8f0",
        navy: "#0f172a",
        inst: "#2563eb",
        clean: "#059669",
        warn: "#d97706",
        hazard: "#dc2626",
      },
      fontFamily: {
        sans: ["Inter", "Helvetica Neue", "Arial", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "SF Mono", "ui-monospace", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,42,0.04), 0 1px 1px rgba(15,23,42,0.03)",
        pop: "0 20px 50px -12px rgba(15,23,42,0.25)",
      },
    },
  },
  plugins: [],
};
