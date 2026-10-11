import { fmtMs, fmtUsd } from "@/components/console/format";
import { inr } from "@/components/batch/labels";
import type { BatchSummary } from "@/lib/engine/types";

function Tile({ label, value, sub, tone = "" }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="bg-[rgb(11_14_12)] px-4 py-4">
      <p className="label text-mute">{label}</p>
      <p className={`display mt-2 text-3xl ${tone}`}>{value}</p>
      <p className="mt-1 font-mono text-[11px] leading-snug text-mute">{sub}</p>
    </div>
  );
}

// The headline numbers for a finished batch.
export function SummaryCards({ summary, total }: { summary: BatchSummary; total: number }) {
  const pct = (n: number) => `${Math.round((n / Math.max(total, 1)) * 100)}%`;
  const learning =
    summary.coldAvgToolCalls !== null && summary.warmAvgToolCalls !== null
      ? `Cases that started cold took ${summary.coldAvgToolCalls.toFixed(1)} tool calls on average. Cases that reused a saved playbook took ${summary.warmAvgToolCalls.toFixed(1)}.`
      : summary.memoryHits === 0
        ? "Every case started cold."
        : "Every case reused a saved playbook.";

  return (
    <div className="glass glass-tint overflow-hidden">
      <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
        <Tile label="Cases processed" value={`${summary.processed} of ${total}`} sub={`in ${fmtMs(summary.wallMs)}, with the simulated waits shortened${(summary.recoveries ?? 0) > 0 ? `. ${summary.recoveries} failed calls recovered from checkpoints` : ""}`} />
        <Tile label="Resolved with no person" value={`${summary.resolved} (${pct(summary.resolved)})`} sub={`${inr(summary.amountResolved)} paid out or released, each one re-checked`} tone="text-lime" />
        <Tile label="Escalated with a plan" value={`${summary.escalated + summary.failed} (${pct(summary.escalated + summary.failed)})`} sub={`${inr(summary.amountEscalated)} waiting on a person, with the next step written`} tone="text-teal" />
        <Tile label="All-in cost" value={fmtUsd(summary.costUsd)} sub={`${summary.humanUsdAvoided >= 0 ? "Saves" : "Costs"} ${fmtUsd(Math.abs(summary.humanUsdAvoided))} against doing the resolved cases by hand (assumed)`} />
        <Tile label="Learning across the file" value={`${summary.memoryHits} reused`} sub={learning} />
        <Tile
          label="Matches the file's expected outcome"
          value={summary.labelled > 0 ? `${summary.matched} of ${summary.labelled}` : "no labels"}
          sub={summary.labelled > 0 ? "Scored against the expected_outcome column in your file." : "Add an expected_outcome column (resolved or escalated) to score the agents."}
          tone={summary.labelled > 0 && summary.matched === summary.labelled ? "text-lime" : ""}
        />
      </div>
    </div>
  );
}
