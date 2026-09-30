import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#101820",
        paper: "#f4f1ea",
        coral: "#f26b5b",
        teal: "#0d766e",
      },
      fontFamily: {
        display: ["var(--font-space-grotesk)"],
        body: ["var(--font-manrope)"],
      },
    },
  },
  plugins: [],
};

export default config;
