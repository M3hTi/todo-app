import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";
import colors from "tailwindcss/colors";

const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        // Custom palette: primary indigo, neutral slate, danger rose
        brand: colors.indigo,
        neutral: colors.slate,
        danger: colors.rose,
        border: "var(--border)",
        input: "var(--border)",
        ring: "var(--accent-text)",
        background: "var(--surface)",
        foreground: "var(--text-1)",
        primary: {
          DEFAULT: "var(--accent)",
          foreground: "#ffffff",
        },
        secondary: {
          DEFAULT: "var(--surface-hover-nav)",
          foreground: "var(--text-2)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "var(--tag-bg)",
          foreground: "var(--text-3)",
        },
        accent: {
          DEFAULT: "var(--accent-tint)",
          foreground: "var(--accent-text)",
        },
        popover: {
          DEFAULT: "var(--surface-raised)",
          foreground: "var(--text-1)",
        },
        card: {
          DEFAULT: "var(--surface-raised)",
          foreground: "var(--text-1)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [animate],
};

export default config;
