import Link from "next/link";
import { Lock } from "lucide-react";
import HistoryList from "./history-list";
import ThemeToggle from "../components/ThemeToggle";

export default function HistoryPage() {
  return (
    <main className="min-h-screen px-5 py-7 md:px-10 md:py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-7 flex items-center justify-between border-b border-[var(--line)] pb-6">
          <div className="flex items-center gap-4">
            <Link href="/" className="font-display text-sm font-bold tracking-tight text-[var(--muted)] transition hover:text-[var(--ink)]">← ScopeGuard<span className="text-[var(--coral)]">.</span></Link>
            <Link href="/dashboard" className="font-display text-xs font-bold uppercase tracking-[0.16em] text-[var(--muted)] transition hover:text-[var(--ink)]">Analyzer</Link>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-display text-xs font-bold uppercase tracking-[0.16em] text-[var(--muted)]">Workspace / History</span>
            <ThemeToggle />
          </div>
        </div>
        <header className="animate-rise max-w-2xl">
          <div className="mb-4 flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.18em] text-[var(--coral)]">
            <span className="h-2 w-2 rounded-full bg-[var(--coral)]" /> Past checks / 02
          </div>
          <h1 className="font-display text-5xl font-bold leading-[0.96] tracking-tight md:text-6xl">
            Your <span className="text-[var(--teal)]">history.</span>
          </h1>
          <p className="mt-4 max-w-lg text-base leading-7 text-[var(--muted)]">
            Only your checks, kept privately in this browser. Nothing here ever leaves your device.
          </p>
        </header>
        <div role="note" className="sg-note mt-6 flex items-start gap-3 border border-[#bfe3d9] bg-[#eef8f4] px-4 py-3 text-sm leading-6 text-[#1d5c50]">
          <Lock size={17} className="mt-1 shrink-0" />
          <p><span className="font-bold">Fully local history — nothing is stored on any server.</span> Your past checks live only in this browser and never leave your device.</p>
        </div>
        <HistoryList />
      </div>
    </main>
  );
}
