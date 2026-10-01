"use client";

import { ChangeEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Check, CheckCircle2, Clipboard, FileDown, FileText, LoaderCircle, Lock, Send, ShieldAlert, ShieldCheck, Timer, Upload, X } from "lucide-react";
import { getOrCreateUserId } from "@/lib/user-id";
import { downloadAnalysisPdf } from "@/lib/pdf-export";
import { saveHistoryRecord } from "@/lib/history-store";

type AnalysisResult = {
  isScopeCreep: boolean;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  violatedClause: string;
  analysis: string;
  estimatedExtraHours: number;
  suggestedEmailResponse: string;
};

type ReplyTone = "firm" | "friendly" | "formal";

const tones: { value: ReplyTone; label: string; hint: string }[] = [
  { value: "firm", label: "Firm", hint: "Direct about boundaries and costs" },
  { value: "friendly", label: "Friendly", hint: "Warm and collaborative" },
  { value: "formal", label: "Formal", hint: "Businesslike, cites the agreement" },
];

// Staged progress shown while the model thinks (5–15s). Beats a bare spinner.
const stages = [
  "Reading your agreement…",
  "Comparing against the request…",
  "Checking for scope changes…",
  "Drafting your response…",
];

const examples = {
  contract: "The project includes a responsive marketing website with up to five pages. Copywriting, ongoing content updates, and new integrations are excluded from this engagement.",
  request: "Could you also add a customer portal with login, billing history, and a dashboard for the sales team? We would love to have this in the first release.",
};

function CompressLinks() {
  return (
    <span className="inline-flex items-center gap-1">
      <FileDown size={13} className="shrink-0" />
      <a href="https://www.ilovepdf.com/compress_pdf" target="_blank" rel="noreferrer noopener" className="underline underline-offset-2">iLovePDF</a>
      <span aria-hidden="true"> · </span>
      <a href="https://www.ihatepdf.cv/compress-pdf" target="_blank" rel="noreferrer noopener" className="underline underline-offset-2">IHatePDF</a>
    </span>
  );
}

export default function Analyzer() {
  const [file, setFile] = useState<File | null>(null);
  const [contractText, setContractText] = useState("");
  const [clientRequest, setClientRequest] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<ReactNode>("");
  const [copied, setCopied] = useState(false);
  const [showCue, setShowCue] = useState(false);
  const [tone, setTone] = useState<ReplyTone>("formal");
  const [stageIndex, setStageIndex] = useState(0);
  const [pdfBusy, setPdfBusy] = useState(false);
  const resultRef = useRef<HTMLElement | null>(null);

  // Cycle staged messages while waiting on the model.
  useEffect(() => {
    if (!loading) {
      setStageIndex(0);
      return;
    }
    const timer = window.setInterval(() => {
      setStageIndex((index) => (index + 1) % stages.length);
    }, 2600);
    return () => window.clearInterval(timer);
  }, [loading]);

  const scrollToResult = () => {
    setShowCue(false);
    resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const [submitted, setSubmitted] = useState(false);

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] || null;
    setSubmitted(false);
    setResult(null);
    setCopied(false);
    if (selectedFile && selectedFile.size > 10 * 1024 * 1024) {
      setFile(null);
      setError(<span>That file is too big — try under 10 MB. Shrink it free: <CompressLinks /></span>);
      return;
    }
    setError("");
    setFile(selectedFile);
  };

  const loadExample = () => {
    setContractText(examples.contract);
    setClientRequest(examples.request);
    setFile(null);
    setError("");
    setResult(null);
    setCopied(false);
    setSubmitted(false);
  };

  const handleContractText = (value: string) => {
    setContractText(value);
    setResult(null);
    setCopied(false);
  };

  const handleClientRequest = (value: string) => {
    setClientRequest(value);
    setResult(null);
    setCopied(false);
  };

  const handleAnalyze = async () => {
    setSubmitted(true);
    if (!clientRequest.trim() || (!file && !contractText.trim())) {
      setError("Add your agreement and the new request first.");
      return;
    }

    setError("");
    setLoading(true);
    setResult(null);
    setShowCue(false);

    const formData = new FormData();
    if (file) formData.append("contractFile", file);
    formData.append("contractText", contractText);
    formData.append("clientRequest", clientRequest);
    formData.append("tone", tone);
    formData.append("userId", getOrCreateUserId());

    try {
      const response = await fetch("/api/analyze", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Analysis failed.");
      const analysis = data as AnalysisResult;
      setResult(analysis);
      // Full history lives in the browser (free, private). DDB keeps only
      // the compact audit log written server-side.
      saveHistoryRecord({
        id: typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `h-${Date.now()}`,
        timestamp: new Date().toISOString(),
        tone,
        clientRequest,
        isScopeCreep: analysis.isScopeCreep,
        riskLevel: analysis.riskLevel,
        violatedClause: analysis.violatedClause,
        analysis: analysis.analysis,
        estimatedExtraHours: analysis.estimatedExtraHours,
        suggestedEmailResponse: analysis.suggestedEmailResponse,
      });
      // Nudge the eye downward: auto-scroll + floating cue to the answer.
      setShowCue(true);
      window.setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
      window.setTimeout(() => setShowCue(false), 9000);
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

  const downloadPdf = async () => {
    if (!result || pdfBusy) return;
    setPdfBusy(true);
    try {
      await downloadAnalysisPdf(result, clientRequest);
    } catch {
      setError("Could not build the PDF. Try again.");
    } finally {
      setPdfBusy(false);
    }
  };

  const resultSummary = useMemo(() => {
    if (!result) return null;
    return {
      scopeStatus: result.isScopeCreep ? "Extra work: Yes" : "Extra work: No",
      riskLabel: result.riskLevel,
      riskWidth: result.riskLevel === "HIGH" ? "100%" : result.riskLevel === "MEDIUM" ? "66%" : "33%",
    };
  }, [result]);

  const hasBaseline = Boolean(file || contractText.trim());
  const hasRequest = Boolean(clientRequest.trim());
  const canAnalyze = hasBaseline && hasRequest && !loading;

  return (
    <>
      <div className="sr-only" role="status" aria-live="polite">
        {loading ? "Checking the request against your agreement." : result ? "Your scope answer is ready." : ""}
      </div>
      <header className="animate-rise flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <div className="mb-4 flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.18em] text-[var(--coral)]">
            <span className="h-2 w-2 rounded-full bg-[var(--coral)]" /> Scope review / 01
          </div>
          <h1 className="font-display text-5xl font-bold leading-[0.96] tracking-tight md:text-7xl">
            Is this<br />
            <span className="text-[var(--teal)]">extra work?</span>
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-[var(--muted)]">
            Paste your agreement + the new ask. We tell you if it&apos;s extra work, and help you reply.
          </p>
        </div>
        <div className="sg-card flex items-center gap-2 self-start rounded-full border border-[var(--line)] bg-white/50 px-4 py-2 text-xs font-semibold tracking-wide text-[var(--muted)] md:self-end">
          <span className="h-2 w-2 rounded-full bg-[var(--teal)]" /> AWS / BEDROCK ACTIVE
        </div>
      </header>

      <div role="note" className="sg-note animate-rise-delay mt-6 flex items-start gap-3 border border-[#bfe3d9] bg-[#eef8f4] px-4 py-3 text-sm leading-6 text-[#1d5c50]">
        <Lock size={17} className="mt-1 shrink-0" />
        <p><span className="font-bold">Your data is secure and auto-deleted within 24 hours.</span> Locked and encrypted, checked in memory, gone automatically. Never used to train AI.</p>
      </div>

      <section className="animate-rise-delay mt-9 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="sg-card border border-[var(--line)] bg-white/55 p-6 md:p-8">
          <div className="mb-7 flex items-start justify-between">
            <div>
              <div className="mb-2 font-display text-xs font-bold uppercase tracking-[0.16em] text-[var(--coral)]">01 / Baseline</div>
              <h2 className="font-display text-2xl font-bold">Your agreement</h2>
            </div>
            <FileText className="text-[var(--teal)]" />
          </div>
          <label className={`group flex min-h-28 cursor-pointer flex-col items-center justify-center border border-dashed px-5 text-center transition ${file ? "border-[var(--teal)] bg-[#eef8f4]" : "border-[var(--line)] bg-[var(--paper)] hover:border-[var(--coral)]"}`}>
            {file ? <CheckCircle2 className="mb-2 text-[var(--teal)]" size={22} /> : <Upload className="mb-2 text-[var(--coral)]" size={22} />}
            <span className="text-sm font-bold">{file ? file.name : "Upload your agreement (PDF or DOCX)"}</span>
            <span className="mt-1 text-xs text-[var(--muted)]">{file ? "File ready to check" : "PDF or Word, up to 10 MB"}</span>
            <span className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-[var(--teal)]"><Timer size={12} /> Gone in 24 hours, automatically</span>
            <input type="file" accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx" onChange={handleFile} className="sr-only" />
          </label>
          {file && (
            <button type="button" onClick={() => setFile(null)} className="mt-2 flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--coral)]">
              <X size={13} /> Remove file
            </button>
          )}
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
            Big PDF? Shrink it free: <CompressLinks />
          </p>
          <div className="my-5 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
            <span className="h-px flex-1 bg-[var(--line)]" /> or paste text <span className="h-px flex-1 bg-[var(--line)]" />
          </div>
          <textarea
            value={contractText}
            onChange={(event) => handleContractText(event.target.value)}
            aria-label="Agreement text"
            aria-invalid={submitted && !hasBaseline}
            rows={7}
            placeholder="Paste what you agreed to do…"
            className={`w-full resize-y border bg-[var(--paper)] p-4 text-sm leading-6 outline-none transition placeholder:text-[#969b9c] focus:border-[var(--teal)] ${contractText.trim() ? "border-[var(--teal)]" : "border-[var(--line)]"}`}
          />
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className={hasBaseline ? "font-semibold text-[var(--teal)]" : "text-[var(--muted)]"}>{hasBaseline ? "Agreement ready" : "Add a PDF or paste what you agreed"}</span>
            <span className="text-[var(--muted)]">{contractText.length} characters</span>
          </div>
        </div>

        <div className="sg-keep-dark flex flex-col border border-[var(--ink)] bg-[var(--ink)] p-6 text-white md:p-8">
          <div className="mb-7 flex items-start justify-between">
            <div>
              <div className="mb-2 font-display text-xs font-bold uppercase tracking-[0.16em] text-[#f7a094]">02 / Incoming</div>
              <h2 className="font-display text-2xl font-bold">The new request</h2>
            </div>
            <Send className="text-[#f7a094]" />
          </div>
          <textarea
            value={clientRequest}
            onChange={(event) => handleClientRequest(event.target.value)}
            aria-label="Client request"
            aria-invalid={submitted && !hasRequest}
            rows={10}
            placeholder="Paste the new request here, exactly as the client sent it…"
            className={`min-h-56 w-full flex-1 resize-y border bg-white/10 p-4 text-sm leading-6 text-white outline-none transition placeholder:text-white/40 focus:border-[#f7a094] ${hasRequest ? "border-[#78d2c4]" : "border-white/20"}`}
          />
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className={hasRequest ? "font-semibold text-[#78d2c4]" : "text-white/50"}>{hasRequest ? "Request ready" : "Waiting for the new request"}</span>
            <span className="text-white/50">{clientRequest.length} characters</span>
          </div>
          <div className="mt-5">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">Reply tone</div>
            <div className="grid grid-cols-3 gap-1 border border-white/20 bg-white/5 p-1" role="group" aria-label="Reply tone">
              {tones.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTone(option.value)}
                  aria-pressed={tone === option.value}
                  title={option.hint}
                  className={`px-2 py-2 font-display text-xs font-bold transition ${
                    tone === option.value
                      ? "bg-[var(--coral)] text-white"
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={!canAnalyze}
            className="mt-4 flex items-center justify-center gap-2 bg-[var(--coral)] px-5 py-4 font-display text-sm font-bold text-white transition hover:bg-[#a94439] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {loading ? (
              <>
                <LoaderCircle className="animate-spin" size={18} /> {stages[stageIndex]}
              </>
            ) : (
              <>
                Check my request <span aria-hidden="true">→</span>
              </>
            )}
          </button>
          <button type="button" onClick={loadExample} className="mt-4 self-center text-xs text-white/50 underline decoration-white/20 underline-offset-4 hover:text-white">
            Try an example
          </button>
        </div>
      </section>

      {error && (
        <div role="alert" aria-live="assertive" className="sg-error mt-5 border border-[#e2a29a] bg-[#fff3f0] px-4 py-3 text-sm leading-6 text-[#a64035]">
          {error}
        </div>
      )}

      {loading && !result && (
        <section aria-hidden="true" className="sg-card mt-8 border border-[var(--line)] bg-white/70 p-6 md:p-8">
          <div className="flex flex-col gap-5 border-b border-[var(--line)] pb-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="sg-shimmer h-10 w-10 rounded-full" />
              <div>
                <div className="sg-shimmer h-3 w-24" />
                <div className="sg-shimmer mt-2 h-7 w-44" />
              </div>
            </div>
            <div className="flex items-center gap-8">
              <div className="sg-shimmer h-12 w-24" />
              <div className="sg-shimmer h-12 w-20" />
            </div>
          </div>
          <div className="mt-7 grid gap-5 md:grid-cols-2">
            <div className="sg-shimmer h-28" />
            <div className="sg-shimmer h-28" />
          </div>
          <div className="sg-shimmer mt-7 h-40" />
          <p className="mt-4 text-xs font-semibold text-[var(--muted)]">{stages[stageIndex]}</p>
        </section>
      )}

      {result && resultSummary && (
        <section ref={resultRef} className="sg-card animate-pop mt-8 scroll-mt-6 border border-[var(--line)] bg-white/70 p-6 md:p-8">
          <div className="flex flex-col gap-5 border-b border-[var(--line)] pb-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              {result.isScopeCreep ? <ShieldAlert className="text-[var(--coral)]" size={38} /> : <ShieldCheck className="text-[var(--teal)]" size={38} />}
              <div>
                <div className="mb-1 font-display text-xs font-bold uppercase tracking-[0.16em] text-[var(--muted)]">Your answer</div>
                <h2 className="font-display text-3xl font-bold">{resultSummary.scopeStatus}</h2>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-6 sm:gap-8">
              <div>
                <div className="flex items-center gap-2"><div className={`h-3 w-3 rounded-full ${result.riskLevel === "HIGH" ? "bg-[var(--coral)]" : result.riskLevel === "MEDIUM" ? "bg-[#d58b31]" : "bg-[var(--teal)]"}`} /><div className="font-display text-3xl font-bold text-[var(--coral)]">{resultSummary.riskLabel}</div></div>
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">Risk</div>
                <div className="mt-2 h-1 w-24 overflow-hidden bg-[var(--line)]"><div className="h-full bg-[var(--coral)] transition-all" style={{ width: resultSummary.riskWidth }} /></div>
              </div>
              <div>
                <div className="font-display text-3xl font-bold text-[var(--teal)]">{result.estimatedExtraHours}h</div>
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">Extra hours</div>
              </div>
            </div>
          </div>

          <div className="mt-7 grid gap-5 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--muted)]">Why</h3>
              <p className="border-l-2 border-[var(--coral)] bg-[var(--paper)] p-4 text-sm leading-6">{result.violatedClause}</p>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--muted)]">What it means</h3>
              <p className="border-l-2 border-[var(--teal)] bg-[var(--paper)] p-4 text-sm leading-6">{result.analysis}</p>
            </div>
          </div>

          <div className="mt-7">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--muted)]">What to reply</h3>
              <div className="flex items-center gap-3">
                <button type="button" onClick={downloadPdf} disabled={pdfBusy} className="flex items-center gap-1 text-xs font-bold text-[var(--teal)] hover:text-[var(--coral)] disabled:opacity-50">
                  <FileDown size={14} /> {pdfBusy ? "Building PDF…" : "Download PDF"}
                </button>
                <button type="button" onClick={copyResponse} className="flex items-center gap-1 text-xs font-bold text-[var(--teal)] hover:text-[var(--coral)]">
                  {copied ? <Check size={14} /> : <Clipboard size={14} />} {copied ? "Copied!" : "Copy reply"}
                </button>
              </div>
            </div>
            <p className="whitespace-pre-wrap border border-[var(--line)] bg-[var(--paper)] p-5 text-sm leading-7">{result.suggestedEmailResponse}</p>
          </div>
          <p className="mt-5 flex items-center gap-2 text-xs leading-5 text-[var(--muted)]"><Lock size={13} className="shrink-0" /> Locked, encrypted, gone in 24 hours. Never used to train AI.</p>
        </section>
      )}

      {showCue && result && (
        <button
          type="button"
          onClick={scrollToResult}
          className="animate-cue fixed bottom-6 left-1/2 z-50 flex items-center gap-2 rounded-full bg-[var(--ink)] px-5 py-3 font-display text-sm font-bold text-[var(--paper)] shadow-xl transition hover:brightness-110"
        >
          <ArrowDown size={16} /> Your answer is ready — see it
        </button>
      )}
    </>
  );
}
