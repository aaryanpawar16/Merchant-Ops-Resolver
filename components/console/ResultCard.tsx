"use client";

import { Check, Link as LinkIcon } from "lucide-react";
import { useState } from "react";
import { fmtMs, fmtUsd, OUTCOME_LABEL } from "@/components/console/format";
import { WhyNotPanel } from "@/components/console/WhyNotPanel";
import type { RunResult } from "@/lib/engine/types";

const outcomeTone: Record<string, string> = {
  resolved: "border-lime/60 text-lime",
  escalated: "border-teal/60 text-teal",
  failed: "border-ember/60 text-ember",
  not_found: "border-ember/60 text-ember",
  needs_info: "border-ember/60 text-ember",
};

export function ResultCard({ result, runId, memoryNote, model }: { result: RunResult; runId: string | null; memoryNote: string | null; model: string }) {
  const [copied, setCopied] = useState(false);
  const report = result.report;

  async function copyLink() {
    if (!runId) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/console?run=${runId}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard can be blocked; the link is still in the address bar after a reload
    }
  }

  return (
    <div className="glass glass-tint">
      <div className="label flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <span className={`rounded-[2px] border px-2 py-1 ${outcomeTone[result.outcome]}`}>{OUTCOME_LABEL[result.outcome]}</span>
        <span className="text-mute tabular-nums">
          {fmtMs(result.durationMs)} / {fmtUsd(result.cost.totalUsd)}
        </span>
      </div>

      <div className="grid gap-x-8 gap-y-4 px-5 py-4 md:grid-cols-2">
        <div className="space-y-4">
          <p className="text-[15px] leading-snug">{result.summary}</p>

          {memoryNote && <p className="rounded-[2px] border border-lime/40 px-3 py-2 font-mono text-[12px] leading-snug text-lime">{memoryNote}</p>}

          {report && (
            <ul className="space-y-1.5 font-mono text-[12.5px] leading-snug">
              {report.actions.map((action) => (
                <li key={action} className="flex gap-2">
                  <Check aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-lime" />
                  {action}
                </li>
              ))}
            </ul>
          )}

          {result.whyNot && <WhyNotPanel why={result.whyNot} defaultOpen={!result.whyNot.automatic} />}

          {runId && (
            <div className="label flex flex-wrap gap-2 pt-1">
              <button type="button" onClick={copyLink} className="flex items-center gap-2 rounded-[2px] border border-line px-3 py-2 transition-colors hover:border-lime hover:text-lime">
                <LinkIcon aria-hidden="true" className="size-3.5" />
                {copied ? "Link copied" : "Copy link to this run"}
              </button>
            </div>
          )}
        </div>

        {report && (
          <div className="space-y-4">
            <figure>
              <figcaption className="label mb-1.5 text-mute">Message sent to the merchant</figcaption>
              <blockquote className="rounded-[2px] border-l-2 border-lime/70 bg-black/30 px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-line text-ink/90">{report.merchantMessage}</blockquote>
              <p className={`mt-1.5 font-mono text-[11px] leading-snug ${report.narrated ? "text-teal" : "text-mute"}`}>
                {report.narrated ? `Subject line written by ${model}. The body is built from verified facts.` : "Built-in wording. The body is built from verified facts."}
              </p>
            </figure>

            <figure>
              <figcaption className="label mb-1.5 text-mute">Knowledge base entry</figcaption>
              <p className="rounded-[2px] bg-black/30 px-3.5 py-2.5 font-mono text-[12px] leading-relaxed text-mute">{report.kbEntry}</p>
            </figure>
          </div>
        )}
      </div>
    </div>
  );
}
