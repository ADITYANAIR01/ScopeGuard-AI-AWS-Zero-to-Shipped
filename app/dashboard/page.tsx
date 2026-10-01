import Link from "next/link";
import Analyzer from "./analyzer";
import ThemeToggle from "../components/ThemeToggle";
import HistoryLink from "../history/history-link";

export default function DashboardPage() {
  return (
    <main className="min-h-screen px-5 py-7 md:px-10 md:py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-7 flex items-center justify-between border-b border-[var(--line)] pb-6">
          <Link href="/" className="font-display text-sm font-bold tracking-tight text-[var(--muted)] transition hover:text-[var(--ink)]">← ScopeGuard<span className="text-[var(--coral)]">.</span></Link>
          <div className="flex items-center gap-3">
            <HistoryLink />
            <span className="font-display text-xs font-bold uppercase tracking-[0.16em] text-[var(--muted)]">Workspace / Analyzer</span>
            <ThemeToggle />
          </div>
        </div>
        <Analyzer />
      </div>
    </main>
  );
}
