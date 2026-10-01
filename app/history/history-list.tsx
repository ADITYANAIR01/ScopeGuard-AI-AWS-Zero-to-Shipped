"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Clipboard, History, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { clearHistory, deleteHistoryRecord, loadHistory, type HistoryRecord } from "@/lib/history-store";
import { downloadAnalysisPdf } from "@/lib/pdf-export";

type ScopeFilter = "all" | "creep" | "inscope";
type RiskFilter = "all" | "LOW" | "MEDIUM" | "HIGH";

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function HistoryList() {
  const [entries, setEntries] = useState<HistoryRecord[]>([]);
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Local-only: loads from this browser's storage. First-time visitors
  // get an empty list and never see the History nav link at all.
  useEffect(() => {
    setEntries(loadHistory());
  }, []);

  const filtered = useMemo(() => {
    return entries.filter((entry) => {
      if (scopeFilter === "creep" && !entry.isScopeCreep) return false;
      if (scopeFilter === "inscope" && entry.isScopeCreep) return false;
      if (riskFilter !== "all" && entry.riskLevel !== riskFilter) return false;
      return true;
    });
  }, [entries, scopeFilter, riskFilter]);

  const copyReply = async (entry: HistoryRecord) => {
    try {
      await navigator.clipboard.writeText(entry.suggestedEmailResponse);
      setCopiedId(entry.id);
      window.setTimeout(() => setCopiedId((current) => (current === entry.id ? null : current)), 1800);
    } catch {
      // Clipboard unavailable — ignore.
    }
  };

  if (entries.length === 0) {
    return (
      <div className="sg-card mt-6 border border-[var(--line)] bg-white/55 p-10 text-center">
        <History className="mx-auto mb-3 text-[var(--muted)]" size={28} />
        <h2 className="font-display text-xl font-bold">No past checks yet</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--muted)]">
          Run your first scope check and the full answer will show up here, kept privately in this browser.
        </p>
      </div>
    );
  }

  const pill = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-bold transition ${
      active
        ? "border-[var(--ink)] bg-[var(--ink)] text-white"
        : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--coral)]"
    }`;

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by scope">
        <button type="button" onClick={() => setScopeFilter("all")} className={pill(scopeFilter === "all")}>All</button>
        <button type="button" onClick={() => setScopeFilter("creep")} className={pill(scopeFilter === "creep")}>Extra work</button>
        <button type="button" onClick={() => setScopeFilter("inscope")} className={pill(scopeFilter === "inscope")}>In scope</button>
        <span className="mx-1 h-4 w-px bg-[var(--line)]" aria-hidden="true" />
        <span className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by risk">
          <button type="button" onClick={() => setRiskFilter("all")} className={pill(riskFilter === "all")}>Any risk</button>
          {(["LOW", "MEDIUM", "HIGH"] as const).map((risk) => (
            <button key={risk} type="button" onClick={() => setRiskFilter(riskFilter === risk ? "all" : risk)} className={pill(riskFilter === risk)}>
              {risk}
            </button>
          ))}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => {
            clearHistory();
            setEntries([]);
            setExpanded(null);
          }}
          className="flex items-center gap-1 text-xs font-bold text-[var(--muted)] hover:text-[var(--coral)]"
        >
          <Trash2 size={13} /> Clear all
        </button>
      </div>

      <p className="mt-4 text-xs text-[var(--muted)]" role="status">
        Showing {filtered.length} of {entries.length} checks · stored only in this browser
      </p>

      {filtered.length === 0 ? (
        <p className="mt-6 text-sm text-[var(--muted)]">Nothing matches these filters. Try clearing them.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {filtered.map((entry) => {
            const open = expanded === entry.id;
            return (
              <li key={entry.id} className="sg-card border border-[var(--line)] bg-white/55 p-4 md:p-5">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : entry.id)}
                  aria-expanded={open}
                  className="flex w-full flex-wrap items-center gap-3 text-left"
                >
                  {entry.isScopeCreep
                    ? <ShieldAlert className="shrink-0 text-[var(--coral)]" size={22} />
                    : <ShieldCheck className="shrink-0 text-[var(--teal)]" size={22} />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">
                      {entry.isScopeCreep ? "Extra work" : "In scope"} · {entry.riskLevel} · {entry.estimatedExtraHours}h · {entry.tone}
                    </span>
                    <span className="block truncate text-xs text-[var(--muted)]">{entry.clientRequest}</span>
                  </span>
                  <span className="shrink-0 text-xs text-[var(--muted)]">{formatDate(entry.timestamp)}</span>
                </button>
                {open && (
                  <div className="animate-pop mt-3 border-t border-[var(--line)] pt-4">
                    <h3 className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-[var(--muted)]">The request</h3>
                    <p className="whitespace-pre-wrap text-sm leading-6">{entry.clientRequest}</p>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div>
                        <h3 className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-[var(--muted)]">Why</h3>
                        <p className="border-l-2 border-[var(--coral)] bg-[var(--paper)] p-3 text-sm leading-6">{entry.violatedClause}</p>
                      </div>
                      <div>
                        <h3 className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-[var(--muted)]">What it means</h3>
                        <p className="border-l-2 border-[var(--teal)] bg-[var(--paper)] p-3 text-sm leading-6">{entry.analysis}</p>
                      </div>
                    </div>
                    <h3 className="mb-1 mt-4 text-xs font-bold uppercase tracking-[0.14em] text-[var(--muted)]">The reply ({entry.tone})</h3>
                    <p className="whitespace-pre-wrap border border-[var(--line)] bg-[var(--paper)] p-4 text-sm leading-7">{entry.suggestedEmailResponse}</p>
                    <div className="mt-3 flex items-center gap-4">
                      <button
                        type="button"
                        onClick={() => copyReply(entry)}
                        className="flex items-center gap-1 text-xs font-bold text-[var(--teal)] hover:text-[var(--coral)]"
                      >
                        {copiedId === entry.id ? <Check size={14} /> : <Clipboard size={14} />}
                        {copiedId === entry.id ? "Copied!" : "Copy reply"}
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadAnalysisPdf({
                          isScopeCreep: entry.isScopeCreep,
                          riskLevel: entry.riskLevel,
                          violatedClause: entry.violatedClause,
                          analysis: entry.analysis,
                          estimatedExtraHours: entry.estimatedExtraHours,
                          suggestedEmailResponse: entry.suggestedEmailResponse,
                        }, entry.clientRequest)}
                        className="text-xs font-bold text-[var(--teal)] hover:text-[var(--coral)]"
                      >
                        Download PDF
                      </button>
                      <span className="flex-1" />
                      <button
                        type="button"
                        onClick={() => {
                          setEntries(deleteHistoryRecord(entry.id));
                          if (open) setExpanded(null);
                        }}
                        className="flex items-center gap-1 text-xs font-bold text-[var(--muted)] hover:text-[var(--coral)]"
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
