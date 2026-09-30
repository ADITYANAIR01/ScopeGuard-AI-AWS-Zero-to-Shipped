import Link from "next/link";
import { ArrowUpRight, Check, FileText, ScanSearch, ShieldCheck, Sparkles } from "lucide-react";

const signals = [
  ["01", "Read the agreement", "Upload a SOW or paste the important clauses. ScopeGuard turns contract language into a baseline."],
  ["02", "Bring the ask", "Drop in the request exactly as it arrived, from email, Slack, or a late-night voice note."],
  ["03", "Reply with clarity", "Get the clause, the risk, the hours, and a professional response draft in one pass."],
];

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f5f1e8] text-[var(--ink)]">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 md:px-10">
        <Link href="/" className="flex items-center gap-3 font-display text-lg font-bold tracking-tight">
          <span className="grid h-9 w-9 place-items-center bg-[var(--ink)] text-[var(--coral)]"><ShieldCheck size={20} /></span>
          ScopeGuard<span className="text-[var(--coral)]">.</span>
        </Link>
        <div className="flex items-center gap-4 text-sm font-bold">
          <a href="#how-it-works" className="hidden text-[var(--muted)] transition hover:text-[var(--ink)] md:block">How it works</a>
          <Link href="/dashboard" className="group flex items-center gap-2 border border-[var(--ink)] px-4 py-2.5 transition hover:bg-[var(--ink)] hover:text-white">Open analyzer <ArrowUpRight size={16} className="transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></Link>
        </div>
      </nav>

      <section className="relative mx-auto max-w-7xl px-6 pb-20 pt-12 md:px-10 md:pb-28 md:pt-24">
        <div className="relative grid items-end gap-14 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="animate-rise">
            <div className="mb-7 flex items-center gap-2 font-display text-xs font-bold uppercase tracking-[0.2em] text-[var(--coral)]"><Sparkles size={15} /> scope intelligence for independent teams</div>
            <h1 className="max-w-4xl font-display text-[clamp(3.6rem,9vw,8.8rem)] font-bold leading-[0.86] tracking-[-0.06em]">Stop giving<br /><span className="text-[var(--teal)]">away the work.</span></h1>
            <p className="mt-8 max-w-xl text-lg leading-8 text-[var(--muted)] md:text-xl">ScopeGuard compares the request with the promise. It finds the drift, cites the agreement, and helps you answer without the awkwardness.</p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link href="/dashboard" className="group flex items-center gap-3 bg-[var(--coral)] px-6 py-4 font-display text-sm font-bold text-white transition hover:bg-[#a94439]">Check a request <ArrowUpRight size={18} className="transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></Link>
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--muted)]">Powered by Amazon Bedrock</span>
            </div>
          </div>
          <div className="animate-rise-delay relative lg:pb-5">
            <div className="rotate-2 border border-[var(--ink)] bg-[var(--ink)] p-4 shadow-[14px_14px_0_#d8c7b9] transition duration-500 hover:rotate-0">
              <div className="border border-white/15 bg-[#19242a] p-5 text-white md:p-7">
                <div className="mb-12 flex items-start justify-between"><div><div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#f7a094]">Scope review / 0042</div><div className="font-display text-2xl font-bold">A clearer read<br />of the ask.</div></div><ScanSearch className="text-[#f7a094]" /></div>
                <div className="space-y-3 border-t border-white/15 pt-4"><div className="flex justify-between text-xs text-white/50"><span>Agreement match</span><span className="font-bold text-[#8ed4c6]">62%</span></div><div className="h-2 bg-white/10"><div className="h-full w-[62%] bg-[#8ed4c6]" /></div><div className="flex justify-between pt-2 text-xs text-white/50"><span>Scope risk</span><span className="font-bold text-[#f7a094]">HIGH</span></div></div>
                <div className="mt-7 flex items-start gap-3 border-l-2 border-[#f7a094] bg-white/5 p-3 text-sm leading-6 text-white/80"><FileText size={17} className="mt-1 shrink-0 text-[#f7a094]" /> “New customer portal” is outside the five-page website deliverable.</div>
              </div>
            </div>
            <div className="absolute -bottom-7 -left-6 flex items-center gap-2 border border-[var(--line)] bg-white px-4 py-3 text-xs font-bold shadow-sm"><span className="grid h-6 w-6 place-items-center rounded-full bg-[#d9f0e9] text-[var(--teal)]"><Check size={14} /></span> Say yes, with a number.</div>
          </div>
        </div>
      </section>

      <section className="border-y border-[var(--line)] bg-[#eee9df]" id="how-it-works">
        <div className="mx-auto max-w-7xl px-6 py-16 md:px-10 md:py-20"><div className="mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><div className="mb-3 font-display text-xs font-bold uppercase tracking-[0.2em] text-[var(--coral)]">The calm before the reply</div><h2 className="max-w-xl font-display text-4xl font-bold leading-tight md:text-5xl">Less guessing.<br />More grounded conversations.</h2></div><p className="max-w-sm text-sm leading-6 text-[var(--muted)]">Built for freelancers, studios, and product teams who want to protect the relationship and the margin.</p></div><div className="grid gap-px border border-[var(--line)] bg-[var(--line)] md:grid-cols-3">{signals.map(([number, title, body]) => <article key={number} className="bg-[#eee9df] p-6 md:p-8"><div className="mb-12 font-display text-sm font-bold text-[var(--coral)]">{number}</div><h3 className="mb-3 font-display text-xl font-bold">{title}</h3><p className="text-sm leading-6 text-[var(--muted)]">{body}</p></article>)}</div></div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-16 md:px-10 md:py-24"><div className="flex flex-col items-start justify-between gap-8 border-l-4 border-[var(--coral)] pl-6 md:flex-row md:items-center md:pl-8"><div><h2 className="font-display text-4xl font-bold leading-tight md:text-5xl">Your scope is<br /><span className="text-[var(--teal)]">worth defending.</span></h2><p className="mt-4 max-w-md text-sm leading-6 text-[var(--muted)]">Bring the next request. Leave with a useful answer.</p></div><Link href="/dashboard" className="group flex shrink-0 items-center gap-3 bg-[var(--ink)] px-6 py-4 font-display text-sm font-bold text-white transition hover:bg-[var(--teal)]">Open ScopeGuard <ArrowUpRight size={18} className="transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></Link></div></section>
      <footer className="mx-auto flex max-w-7xl flex-col gap-2 border-t border-[var(--line)] px-6 py-7 text-xs text-[var(--muted)] md:flex-row md:justify-between md:px-10"><span>ScopeGuard AI / Scope intelligence for independent teams</span><span>Private by design · Powered by Amazon Bedrock</span></footer>
    </main>
  );
}
