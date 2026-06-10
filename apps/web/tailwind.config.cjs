/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./index.tsx",
    "./App.tsx",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./services/**/*.{js,ts,jsx,tsx}",
    "./store/**/*.{js,ts,jsx,tsx}",
    "./utils/**/*.{js,ts,jsx,tsx}",
    "./types.ts",
  ],
  theme: {
    extend: {
      colors: {
        // 品牌主色系（用于按钮、链接等强调元素）
        primary: {
          DEFAULT: "var(--color-primary, #e68c19)",
          hover: "var(--color-primary-hover, #d97e10)",
          active: "var(--color-primary-active, #c97108)",
          light: "var(--color-primary-light, #fff7ed)",
        },
        // 强调色系（次要强调）
        accent: {
          DEFAULT: "var(--color-accent, #00a8ff)",
          hover: "var(--color-accent-hover, #00ccff)",
          active: "var(--color-accent-active, #0099dd)",
        },
        // 次要色（深色，用于标题等）
        secondary: "var(--color-secondary, #1A1A1A)",
        // 文字色系（用于不同层级文字）
        text: {
          primary: "var(--color-text-primary, #002244)",
          secondary: "var(--color-text-secondary, #666666)",
          muted: "var(--color-text-muted, #999999)",
        },
        // 背景色系
        background: {
          DEFAULT: "var(--color-bg, #fdfbf7)",
          warm: "var(--color-bg-warm, #fcfaf7)",
          light: "#f8f7f6",
        },
        // 表面色（卡片、侧边栏等）
        surface: {
          white: "#ffffff",
          warm: "var(--color-surface, #fcfaf7)",
        },
        // 边框色系
        border: {
          DEFAULT: "var(--color-border, #e0e0e0)",
          focus: "var(--color-border-focus, #e68c19)",
        },
      },
      fontFamily: {
        sans: [
          "Noto Sans SC",
          "Inter",
          "Segoe UI",
          "Microsoft YaHei UI",
          "system-ui",
          "sans-serif",
        ],
        display: [
          "Inter",
          "Noto Sans SC",
          "Segoe UI",
          "Microsoft YaHei UI",
          "system-ui",
          "sans-serif",
        ],
      },
      keyframes: {
        slideDown: {
          "0%": { transform: "translateY(-20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        "slide-down": "slideDown 0.3s ease-out",
      },
    },
  },
  plugins: [
    function ({ addUtilities }) {
      addUtilities({
        ".scrollbar-hide": {
          "-ms-overflow-style": "none",
          "scrollbar-width": "none",
          "&::-webkit-scrollbar": { display: "none" },
        },
      });
    },
  ],
};
