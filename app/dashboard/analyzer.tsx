"use client";

import { ChangeEvent, useMemo, useState } from "react";
import { Check, Clipboard, Download, FileText, LoaderCircle, Send, ShieldAlert, ShieldCheck, Upload, X } from "lucide-react";

type AnalysisResult = {
  isScopeCreep: boolean;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  violatedClause: string;
  analysis: string;
  estimatedExtraHours: number;
  suggestedEmailResponse: string;
};

const examples = {
  contract: "The project includes a responsive marketing website with up to five pages. Copywriting, ongoing content updates, and new integrations are excluded from this engagement.",
  request: "Could you also add a customer portal with login, billing history, and a dashboard for the sales team? We would love to have this in the first release.",
};

function buildSummaryText(result: AnalysisResult, timestamp: string) {
  return [
    "ScopeGuard AI - Scope Change Order Summary",
    `Generated: ${timestamp}`,
    "",
    `Scope creep: ${result.isScopeCreep ? "Yes" : "No"}`,
    `Risk level: ${result.riskLevel}`,
    `Estimated extra hours: ${result.estimatedExtraHours}`,
    "",
    "Relevant clause:",
    result.violatedClause,
    "",
    "Analysis:",
    result.analysis,
    "",
    "Suggested response:",
    result.suggestedEmailResponse,
    "",
  ].join("\n");
}

export default function Analyzer() {
  const [file, setFile] = useState<File | null>(null);
  const [contractText, setContractText] = useState("");
  const [clientRequest, setClientRequest] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => setFile(event.target.files?.[0] || null);

  const loadExample = () => {
    setContractText(examples.contract);
    setClientRequest(examples.request);
    setFile(null);
  };

  const handleAnalyze = async () => {
    if (!clientRequest.trim() || (!file && !contractText.trim())) {
      setError("Add a client request and either upload a PDF or paste the SOW text.");
      return;
    }

    setError("");
    setLoading(true);
    setResult(null);

    const formData = new FormData();
    if (file) formData.append("contractFile", file);
    formData.append("contractText", contractText);
    formData.append("clientRequest", clientRequest);

    try {
      const response = await fetch("/api/analyze", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Analysis failed.");
      setResult(data as AnalysisResult);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not connect to the analysis service.");
    } finally {
      setLoading(false);
    }
  };

  const copyResponse = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.suggestedEmailResponse);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const downloadSummary = () => {
    if (!result) return;

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `Scope_Change_Order_${timestamp}.txt`;
    const summary = buildSummaryText(result, timestamp);
    const blob = new Blob([summary], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const resultSummary = useMemo(() => {
    if (!result) return null;
    return {
      scopeStatus: result.isScopeCreep ? "Scope creep detected" : "Within agreed scope",
      riskLabel: result.riskLevel,
    };
  }, [result]);

  return (
    <>
      <header className="animate-rise flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <div className="mb-4 flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.18em] text-[var(--coral)]">
            <span className="h-2 w-2 rounded-full bg-[var(--coral)]" /> Scope review / 01
          </div>
          <h1 className="font-display text-5xl font-bold leading-[0.96] tracking-tight md:text-7xl">
            Make scope<br />
            <span className="text-[var(--teal)]">visible.</span>
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-[var(--muted)]">
            Cross-check a client request against the agreement before “just one more thing” turns into unpaid work.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start rounded-full border border-[var(--line)] bg-white/50 px-4 py-2 text-xs font-semibold tracking-wide text-[var(--muted)] md:self-end">
          <span className="h-2 w-2 rounded-full bg-[var(--teal)]" /> AWS / BEDROCK ACTIVE
        </div>
      </header>

      <section className="animate-rise-delay mt-9 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="border border-[var(--line)] bg-white/55 p-6 md:p-8">
          <div className="mb-7 flex items-start justify-between">
            <div>
              <div className="mb-2 font-display text-xs font-bold uppercase tracking-[0.16em] text-[var(--coral)]">01 / Baseline</div>
              <h2 className="font-display text-2xl font-bold">Your agreement</h2>
            </div>
            <FileText className="text-[var(--teal)]" />
          </div>
          <label className="group flex min-h-28 cursor-pointer flex-col items-center justify-center border border-dashed border-[var(--line)] bg-[var(--paper)] px-5 text-center transition hover:border-[var(--coral)]">
            <Upload className="mb-2 text-[var(--coral)]" size={22} />
            <span className="text-sm font-bold">{file ? file.name : "Drop your SOW PDF here"}</span>
            <span className="mt-1 text-xs text-[var(--muted)]">PDF up to 10 MB</span>
            <input type="file" accept="application/pdf,.pdf" onChange={handleFile} className="sr-only" />
          </label>
          {file && (
            <button type="button" onClick={() => setFile(null)} className="mt-2 flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--coral)]">
              <X size={13} /> Remove file
            </button>
          )}
          <div className="my-5 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
            <span className="h-px flex-1 bg-[var(--line)]" /> or paste text <span className="h-px flex-1 bg-[var(--line)]" />
          </div>
          <textarea
            value={contractText}
            onChange={(event) => setContractText(event.target.value)}
            rows={7}
            placeholder="Paste the deliverables, exclusions, and constraints from your SOW..."
            className="w-full resize-y border border-[var(--line)] bg-[var(--paper)] p-4 text-sm leading-6 outline-none transition placeholder:text-[#969b9c] focus:border-[var(--teal)]"
          />
        </div>

        <div className="flex flex-col border border-[var(--ink)] bg-[var(--ink)] p-6 text-white md:p-8">
          <div className="mb-7 flex items-start justify-between">
            <div>
              <div className="mb-2 font-display text-xs font-bold uppercase tracking-[0.16em] text-[#f7a094]">02 / Incoming</div>
              <h2 className="font-display text-2xl font-bold">The new request</h2>
            </div>
            <Send className="text-[#f7a094]" />
          </div>
          <textarea
            value={clientRequest}
            onChange={(event) => setClientRequest(event.target.value)}
            rows={10}
            placeholder="Paste the message from email, Slack, or WhatsApp..."
            className="min-h-56 w-full flex-1 resize-y border border-white/20 bg-white/10 p-4 text-sm leading-6 text-white outline-none transition placeholder:text-white/40 focus:border-[#f7a094]"
          />
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={loading}
            className="mt-5 flex items-center justify-center gap-2 bg-[var(--coral)] px-5 py-4 font-display text-sm font-bold text-white transition hover:bg-[#ff806e] disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? (
              <>
                <LoaderCircle className="animate-spin" size={18} /> Reading the fine print...
              </>
            ) : (
              <>
                Evaluate scope <span aria-hidden="true">→</span>
              </>
            )}
          </button>
          <button type="button" onClick={loadExample} className="mt-4 self-center text-xs text-white/50 underline decoration-white/20 underline-offset-4 hover:text-white">
            Load a sample case
          </button>
        </div>
      </section>

      {error && (
        <div role="alert" className="mt-5 border border-[#e2a29a] bg-[#fff3f0] px-4 py-3 text-sm text-[#a64035]">
          {error}
        </div>
      )}

      {result && resultSummary && (
        <section className="animate-rise mt-8 border border-[var(--line)] bg-white/70 p-6 md:p-8">
          <div className="flex flex-col gap-5 border-b border-[var(--line)] pb-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              {result.isScopeCreep ? <ShieldAlert className="text-[var(--coral)]" size={38} /> : <ShieldCheck className="text-[var(--teal)]" size={38} />}
              <div>
                <div className="mb-1 font-display text-xs font-bold uppercase tracking-[0.16em] text-[var(--muted)]">Assessment complete</div>
                <h2 className="font-display text-3xl font-bold">{resultSummary.scopeStatus}</h2>
              </div>
            </div>
            <div className="flex items-center gap-8">
              <div>
                <div className="font-display text-3xl font-bold text-[var(--coral)]">{resultSummary.riskLabel}</div>
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">Risk level</div>
              </div>
              <div>
                <div className="font-display text-3xl font-bold text-[var(--teal)]">{result.estimatedExtraHours}h</div>
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">Extra estimate</div>
              </div>
            </div>
          </div>

          <div className="mt-7 grid gap-5 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--muted)]">Relevant clause</h3>
              <p className="border-l-2 border-[var(--coral)] bg-[var(--paper)] p-4 text-sm leading-6">{result.violatedClause}</p>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--muted)]">What it means</h3>
              <p className="border-l-2 border-[var(--teal)] bg-[var(--paper)] p-4 text-sm leading-6">{result.analysis}</p>
            </div>
          </div>

          <div className="mt-7">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--muted)]">Response draft</h3>
              <div className="flex items-center gap-3">
                <button type="button" onClick={downloadSummary} className="flex items-center gap-1 text-xs font-bold text-[var(--teal)] hover:text-[var(--coral)]">
                  <Download size={14} /> Download summary
                </button>
                <button type="button" onClick={copyResponse} className="flex items-center gap-1 text-xs font-bold text-[var(--teal)] hover:text-[var(--coral)]">
                  {copied ? <Check size={14} /> : <Clipboard size={14} />} {copied ? "Copied" : "Copy response"}
                </button>
              </div>
            </div>
            <p className="whitespace-pre-wrap border border-[var(--line)] bg-[var(--paper)] p-5 text-sm leading-7">{result.suggestedEmailResponse}</p>
          </div>
        </section>
      )}
    </>
  );
}
