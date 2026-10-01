"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("sg-theme");
    const isDark = saved
      ? saved === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDark(isDark);
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    localStorage.setItem("sg-theme", next ? "dark" : "light");
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className="grid h-10 w-10 place-items-center border border-[var(--line)] text-[var(--muted)] transition hover:border-[var(--teal)] hover:text-[var(--ink)]"
    >
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
