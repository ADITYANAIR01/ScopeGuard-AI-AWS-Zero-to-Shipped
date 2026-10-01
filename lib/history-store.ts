"use client";

// Full per-user history kept in the browser (localStorage) — free, private,
// and complete. Nothing here touches DynamoDB, so the admin incurs no
// storage charges for history. Local by nature: a user only ever sees
// checks made in their own browser.

export type HistoryRecord = {
  id: string;
  timestamp: string;
  tone: "firm" | "friendly" | "formal";
  clientRequest: string;
  isScopeCreep: boolean;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  violatedClause: string;
  analysis: string;
  estimatedExtraHours: number;
  suggestedEmailResponse: string;
};

const STORAGE_KEY = "scopeguard-history-v1";
const MAX_ENTRIES = 50;

function isRecord(value: unknown): value is HistoryRecord {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.timestamp === "string" &&
    typeof r.clientRequest === "string" &&
    typeof r.isScopeCreep === "boolean" &&
    (r.riskLevel === "LOW" || r.riskLevel === "MEDIUM" || r.riskLevel === "HIGH") &&
    typeof r.violatedClause === "string" &&
    typeof r.analysis === "string" &&
    typeof r.estimatedExtraHours === "number" &&
    typeof r.suggestedEmailResponse === "string"
  );
}

export function loadHistory(): HistoryRecord[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecord).sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  } catch {
    return [];
  }
}

export function saveHistoryRecord(record: HistoryRecord): void {
  try {
    const existing = loadHistory().filter((entry) => entry.id !== record.id);
    const next = [record, ...existing].slice(0, MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full or unavailable — history is a bonus, never a blocker.
    // Evict oldest and retry once.
    try {
      const trimmed = loadHistory().slice(0, MAX_ENTRIES - 1);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([record, ...trimmed]));
    } catch {
      // Give up silently.
    }
  }
}

export function deleteHistoryRecord(id: string): HistoryRecord[] {
  const next = loadHistory().filter((entry) => entry.id !== id);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore.
  }
  return next;
}

export function clearHistory(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}

export function historyCount(): number {
  return loadHistory().length;
}
