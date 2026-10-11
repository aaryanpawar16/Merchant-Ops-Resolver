"use client";

import { ChevronDown, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { fmtMs } from "@/components/console/format";
import { humanNextStep, inr, OUTCOME_STYLE, PATTERN_LABEL } from "@/components/batch/labels";
import type { IntakeCase } from "@/lib/engine/intake";
import type { BatchCaseResult } from "@/lib/engine/types";

const columns = "md:grid-cols-[4.5rem_minmax(0,1.3fr)_7.5rem_minmax(0,1.2fr)_6.5rem_4.5rem_1.5rem]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-x-4 py-1">
      <dt className="label pt-0.5 text-mute">{label}</dt>
      <dd className="font-mono text-[12.5px] leading-snug">{children}</dd>
    </div>
  );
}

// One row per case. Rows fill in live while a batch runs, and open to show what the agents found and did.
export function ResultsTable({ cases, results, current }: { cases: IntakeCase[]; results: BatchCaseResult[]; current: number | null }) {
  const [open, setOpen] = useState<number | null>(null);
  const byIndex = new Map(results.map((r) => [r.index, r]));

  return (
    <div className="glass glass-tint overflow-hidden">
      <div className={`label hidden gap-x-3 border-b border-line px-4 py-3 text-mute md:grid ${columns}`}>
        <span>Txn</span>
        <span>Merchant</span>
        <span className="text-right">Amount</span>
        <span>Issue in the file</span>
        <span>Outcome</span>
        <span className="text-right">Time</span>
        <span />
      </div>

      <ul>
        {cases.map((c) => {
          const r = byIndex.get(c.index);
          const style = r ? OUTCOME_STYLE[r.outcome] : null;
          const working = current === c.index;
          const expanded = open === c.index && r;
          return (
            <li key={c.index} className="border-b border-line last:border-b-0">
              <button
                type="button"
                disabled={!r}
                onClick={() => setOpen(expanded ? null : c.index)}
                aria-expanded={Boolean(expanded)}
                className={`grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-4 py-3 text-left transition-colors enabled:hover:bg-white/[0.04] ${columns}`}
              >
                <span className="hidden font-mono text-[12.5px] text-mute md:block">{c.txn}</span>
                <span className="min-w-0 text-[14px]">
                  <span className="block truncate">{c.merchant}</span>
                  <span className="block font-mono text-[11px] text-mute md:hidden">
                    {c.txn} / {inr(c.amount)} / {PATTERN_LABEL[c.pattern]}
                  </span>
                </span>
                <span className="hidden text-right font-mono text-[12.5px] tabular-nums md:block">{inr(c.amount)}</span>
                <span className="hidden min-w-0 md:block">
                  <span className="block truncate text-[13px]">{PATTERN_LABEL[c.pattern]}</span>
                  <span className="block truncate font-mono text-[11px] text-mute" title={c.reason}>
                    {c.reason}
                  </span>
                </span>
                <span>
                  {style ? (
                    <span className={`label inline-block rounded-[2px] border px-2 py-1 ${style.className}`}>{style.label}</span>
                  ) : working ? (
                    <span className="label inline-flex items-center gap-2 rounded-[2px] border border-lime/60 px-2 py-1 text-lime">
                      <span aria-hidden="true" className="animate-blink size-1.5 bg-lime" />
                      Working
                    </span>
                  ) : (
                    <span className="label text-mute">Queued</span>
                  )}
                </span>
                <span className="hidden text-right font-mono text-[12px] text-mute tabular-nums md:block">{r ? fmtMs(r.durationMs) : ""}</span>
                <ChevronDown aria-hidden="true" className={`hidden size-4 text-mute transition-transform md:block ${expanded ? "rotate-180" : ""} ${r ? "" : "opacity-0"}`} />
              </button>

              {expanded && r && (
                <div className="border-t border-line bg-black/25 px-4 py-4 md:px-6">
                  <dl>
                    <Field label="From the file">{r.reason}</Field>
                    <Field label="Root cause">{r.rootCause}</Field>
                    <Field label="Evidence">
                      {(r.evidence ?? []).length > 0 ? (
                        <ul className="space-y-1">
                          {(r.evidence ?? []).map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-mute">Nothing in the file supported a cause.</span>
                      )}
                    </Field>
                    <Field label="What the agents did">{r.fix}</Field>
                    <Field label="Check afterwards">{r.verification}</Field>
                    {r.subject && <Field label="Email subject">{r.subject}</Field>}
                    {r.outcome !== "resolved" && <Field label="Next, for a person">{humanNextStep(r)}</Field>}
                    {r.matched !== null && (
                      <Field label="Expected outcome">
                        <span className={r.matched ? "text-lime" : "text-ember"}>
                          {r.expected} in the file, {r.outcome} by the agents ({r.matched ? "match" : "mismatch"})
                        </span>
                      </Field>
                    )}
                    <Field label="Effort">
                      {r.toolCalls} tool calls, {r.memoryHit ? "reused a saved playbook" : "started cold"}
                    </Field>
                    {(r.recoveries ?? 0) > 0 && (
                      <Field label="Recovered">
                        <span className="text-lime">
                          {r.recoveries} failed call{r.recoveries === 1 ? "" : "s"} recovered by resuming a checkpoint
                        </span>
                      </Field>
                    )}
                  </dl>
                  {r.runId && (
                    <Link
                      href={`/console?run=${r.runId}`}
                      className="label mt-3 inline-flex items-center gap-2 rounded-[2px] border border-line px-3 py-2 transition-colors hover:border-lime hover:text-lime"
                    >
                      Open the full trace, checkpoints and log
                      <ExternalLink aria-hidden="true" className="size-3.5" />
                    </Link>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
