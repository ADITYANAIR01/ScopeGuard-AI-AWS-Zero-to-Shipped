"use client";

// Anonymous per-browser identity for history isolation.
// No login: each browser gets a random ID in localStorage.
// History APIs only ever return logs matching this ID, so a user
// can never see another user's logs.
const STORAGE_KEY = "scopeguard-user-id";

export function getOrCreateUserId(): string {
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing && /^[A-Za-z0-9-]{8,64}$/.test(existing)) return existing;
    const fresh = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `uid-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    window.localStorage.setItem(STORAGE_KEY, fresh);
    return fresh;
  } catch {
    // Storage unavailable (private mode) — fall back to a session ID.
    // History will simply appear empty for these users.
    return `session-${Date.now()}`;
  }
}

export function getStoredUserId(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
