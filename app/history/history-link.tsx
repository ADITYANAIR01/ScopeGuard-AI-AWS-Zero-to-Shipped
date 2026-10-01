"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { History } from "lucide-react";
import { historyCount } from "@/lib/history-store";

// Renders nothing for first-time visitors (empty local history).
// Returning users with prior checks see a History link.
export default function HistoryLink() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(historyCount() > 0);
  }, []);

  if (!visible) return null;

  return (
    <Link
      href="/history"
      className="flex items-center gap-1.5 font-display text-xs font-bold uppercase tracking-[0.16em] text-[var(--muted)] transition hover:text-[var(--ink)]"
    >
      <History size={14} /> History
    </Link>
  );
}
