"use client";

import { useCallback, useEffect, useState } from "react";
import type { MemoryEntry } from "@/lib/engine/checkpoints";

// What the team has learned from past cases. A repeat case skips the sweep and runs the saved playbook.
export function MemoryPanel({ refreshKey, patternInRun }: { refreshKey: string; patternInRun: string | null }) {
  const [entries, setEntries] = useState<MemoryEntry[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/memory", { cache: "no-store" });
      setEntries(((await res.json()) as { entries: MemoryEntry[] }).entries);
    } catch {
      setEntries([]);
    }
  }, []);

  useEffect(() => {
    // Deferred so the state update happens in a callback, not synchronously inside the effect.
    const id = setTimeout(load, 0);
    return () => clearTimeout(id);
  }, [load, refreshKey]);

  async function reset(mode: "reset" | "clear") {
    setBusy(true);
    try {
      const res = await fetch(`/api/memory?mode=${mode}`, { method: "DELETE" });
      setEntries(((await res.json()) as { entries: MemoryEntry[] }).entries);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="label flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 text-mute">
        <span>Memory shared across cases</span>
        <span className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => reset("clear")} className="rounded-[2px] border border-line px-2.5 py-1.5 text-ink transition-colors hover:border-ember hover:text-ember disabled:opacity-50">
            Forget everything
          </button>
          <button type="button" disabled={busy} onClick={() => reset("reset")} className="rounded-[2px] border border-line px-2.5 py-1.5 text-ink transition-colors hover:border-lime hover:text-lime disabled:opacity-50">
            Restore seed
          </button>
        </span>
      </div>
      <div className="max-h-[26rem] overflow-y-auto px-4 py-3">
        {entries === null && <p className="font-mono text-[12.5px] text-mute">Loading...</p>}
        {entries?.length === 0 && (
          <p className="font-mono text-[12.5px] text-mute">
            Nothing learned yet. Run a case: the next time the same kind of failure comes in, the Investigation worker will start from the saved playbook instead of sweeping every system.
          </p>
        )}
        {entries?.map((entry) => (
          <article key={entry.pattern} className={`mb-3 rounded-[2px] border px-3.5 py-3 last:mb-0 ${entry.pattern === patternInRun ? "border-lime/60" : "border-line"}`}>
            <p className="flex flex-wrap items-baseline justify-between gap-2 font-mono text-[12.5px]">
              <span className="text-ink">{entry.pattern}</span>
              <span className="text-lime">{entry.resolvedCases} cases learned</span>
            </p>
            <p className="mt-1 text-[13px] leading-snug text-mute">{entry.summary}</p>
            <dl className="mt-2 grid grid-cols-[6.5rem_1fr] gap-y-1 font-mono text-[12px]">
              <dt className="text-mute">playbook</dt>
              <dd>{entry.minimalTools.join(", ")}</dd>
              <dt className="text-mute">fix</dt>
              <dd>{entry.fix}</dd>
              <dt className="text-mute">avg run</dt>
              <dd>
                {entry.avgToolCalls} tool calls, {(entry.avgDurationMs / 1000).toFixed(1)} s
              </dd>
              <dt className="text-mute">last checkpoint</dt>
              <dd>{entry.lastCheckpoint}</dd>
            </dl>
          </article>
        ))}
      </div>
    </div>
  );
}
