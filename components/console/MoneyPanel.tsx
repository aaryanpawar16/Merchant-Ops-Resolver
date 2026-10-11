"use client";

import { useEffect, useState } from "react";
import { fmtMs, fmtUsd, plural } from "@/components/console/format";
import { PLAN_URL, type EconomicsSnapshot } from "@/lib/engine/economics";
import type { Cost, RunResult } from "@/lib/engine/types";

// The cfo.ai idea: price the agent like a real product. Measured numbers come from real runs;
// the prices that turn them into dollars are assumptions, listed at the bottom.
export function MoneyPanel({ cost, result, refreshKey }: { cost: Cost; result: RunResult | null; refreshKey: string }) {
  const [eco, setEco] = useState<EconomicsSnapshot | null>(null);
  const [merchants, setMerchants] = useState(20000);
  // The plan's own estimate is 0.15 to 0.20 cases per merchant per month. It is a guess until a real customer says otherwise.
  const [casesPer, setCasesPer] = useState(0.2);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const res = await fetch("/api/economics", { cache: "no-store" });
        const body = (await res.json()) as EconomicsSnapshot;
        if (!cancelled) setEco(body);
      } catch {
        // the panel simply keeps its last snapshot
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [refreshKey]);

  const a = eco?.assumptions;
  const human = eco?.humanUsdPerCase ?? 5.07;
  const m = eco?.measured;

  // Monthly model, driven by the measured cost per case plus the plan's hosted-model share. Fixed costs
  // and runway are in the cfo.ai plan. Escalated cases go back to the customer's team, so they cost us
  // nothing beyond the agent's own work.
  const measuredCost = m && m.runs > 0 ? m.avgCostUsd : cost.totalUsd || 0.004;
  const avgCost = measuredCost + (a ? a.hostedModelShare * a.hostedModelUsdPerCase : 0);
  // The mix of case types in the console is not a real-world rate, so the plan's 65% is the default.
  const [autoRate, setAutoRate] = useState(0.65);
  const cases = merchants * casesPer;
  const resolved = cases * autoRate;
  const escalated = cases - resolved;
  const revenue = a ? merchants * a.platformUsdPerMerchantMonth + resolved * a.priceUsdPerResolvedCase + escalated * a.priceUsdPerEscalatedCase : 0;
  const variableCost = cases * avgCost;
  const margin = revenue > 0 ? (revenue - variableCost) / revenue : 0;
  const saved = resolved * human - revenue;
  // A merchant comes out ahead once the labour a resolved case saves beats the fees they pay. The
  // platform fee is a fixed cost to them, so it only pays off above a minimum number of cases.
  const feePerCase = a ? autoRate * a.priceUsdPerResolvedCase + (1 - autoRate) * a.priceUsdPerEscalatedCase : 0;
  const savedPerCase = autoRate * human;
  const breakEvenCases = a && savedPerCase > feePerCase ? a.platformUsdPerMerchantMonth / (savedPerCase - feePerCase) : null;

  const ratio = cost.totalUsd > 0 ? human / cost.totalUsd : null;

  return (
    <div className="max-h-[32rem] overflow-y-auto">
      <div className="grid gap-px border-b border-line bg-line sm:grid-cols-3">
        <Stat label="This case, all in" value={fmtUsd(cost.totalUsd)} sub={`${plural(cost.toolCalls, "tool call")}, ${plural(cost.llmCalls, "model call")}, ${plural(cost.tokensIn + cost.tokensOut, "token")}`} />
        <Stat label="Same case by hand" value={fmtUsd(human)} sub={a ? `${a.humanMinutesPerCase} min at $${a.humanUsdPerHour}/h (assumed)` : ""} />
        <Stat label="Agent vs human" value={ratio ? `${Math.round(ratio).toLocaleString("en-US")}x cheaper` : "-"} sub={result ? `finished in ${fmtMs(result.durationMs)}` : "run a case to measure"} tone />
      </div>

      <div className="grid gap-6 px-4 py-5 md:grid-cols-2">
        <section>
          <h3 className="label mb-3 text-mute">Compounding, measured across your runs</h3>
          {m && m.runs > 0 ? (
            <div className="space-y-3 font-mono text-[12px]">
              <Compare label="tool calls" cold={m.coldAvgToolCalls} warm={m.warmAvgToolCalls} fmt={(v) => v.toFixed(1)} />
              <Compare label="duration" cold={m.coldAvgDurationMs} warm={m.warmAvgDurationMs} fmt={fmtMs} />
              <p className="text-mute">
                {m.runs} runs, {m.resolved} resolved, {m.escalated} escalated. Cold means no saved playbook, warm means a memory hit. Run the same kind of case twice to see the gap.
              </p>
            </div>
          ) : (
            <p className="font-mono text-[12px] text-mute">No completed runs yet.</p>
          )}
        </section>

        <section>
          <h3 className="label mb-3 text-mute">Monthly model, outcome-based pricing</h3>
          <div className="space-y-3">
            <Slider label="Merchants" value={merchants} min={1000} max={100000} step={1000} onChange={setMerchants} />
            <Slider label="Cases per merchant per month (estimate)" value={casesPer} min={0.05} max={2} step={0.05} onChange={setCasesPer} />
            <Slider label="Resolved without a human (%)" value={Math.round(autoRate * 100)} min={30} max={90} step={5} onChange={(v) => setAutoRate(v / 100)} />
          </div>
          <dl className="mt-4 grid grid-cols-[1fr_auto] gap-y-1.5 font-mono text-[12.5px]">
            <dt className="text-mute">Cases handled</dt>
            <dd className="text-right tabular-nums">{Math.round(cases).toLocaleString("en-US")}</dd>
            <dt className="text-mute">Revenue</dt>
            <dd className="text-right tabular-nums">{fmtUsd(revenue)}</dd>
            <dt className="text-mute">Revenue per merchant</dt>
            <dd className="text-right tabular-nums">{fmtUsd(revenue / merchants)}/mo</dd>
            <dt className="text-mute">Cost per case (agents plus hosted share)</dt>
            <dd className="text-right tabular-nums">{fmtUsd(avgCost)}</dd>
            <dt className="text-mute">Margin over agent costs</dt>
            <dd className={`text-right tabular-nums ${margin >= 0 ? "text-lime" : "text-ember"}`}>{(margin * 100).toFixed(1)}%</dd>
            <dt className="text-mute">Customer savings after our fees</dt>
            <dd className={`text-right tabular-nums ${saved >= 0 ? "" : "text-ember"}`}>{fmtUsd(saved)}/mo</dd>
          </dl>
          {a && (
            <p className={`mt-3 font-mono text-[11px] leading-relaxed ${saved < 0 ? "text-ember" : "text-lime"}`}>
              {breakEvenCases === null
                ? "At these prices a merchant always saves more in labour than they pay."
                : saved < 0
                  ? `At ${casesPer} cases a month merchants pay more than they save. They come out ahead above ${breakEvenCases.toFixed(2)} cases per merchant per month, so the platform fee needs a higher volume or a lower price to be easy to defend.`
                  : `Merchants come out ahead above ${breakEvenCases.toFixed(2)} cases per merchant per month, and this scenario is above that.`}
            </p>
          )}
          <p className="mt-3 font-mono text-[11px] leading-relaxed text-mute">
            Fixed costs, hiring and runway are in the{" "}
            <a href={PLAN_URL} target="_blank" rel="noreferrer" className="text-ink underline underline-offset-2 hover:text-lime">
              cfo.ai plan
            </a>
            . Per-case pricing alone does not cover them until volume is high, so cases per merchant is the number to confirm with a real customer.
          </p>
        </section>
      </div>

      {a && (
        <div className="flex flex-wrap items-start justify-between gap-4 border-t border-line px-4 py-3">
          <p className="max-w-[60ch] font-mono text-[11px] leading-relaxed text-mute">
            Assumptions, not measurements: local llama2 is free, so tokens are priced at ${a.llmUsdPerMTokIn}/M in and ${a.llmUsdPerMTokOut}/M out (typical hosted 7B); ${a.infraUsdPerToolCall} per tool call; {Math.round(a.hostedModelShare * 100)}% of cases on a stronger
            hosted model at ${a.hostedModelUsdPerCase} each; ${a.priceUsdPerResolvedCase} per resolved case, ${a.priceUsdPerEscalatedCase} per escalated case, ${a.platformUsdPerMerchantMonth} per merchant per month. Edit them in lib/engine/economics.ts.
          </p>
          <button
            type="button"
            onClick={async () => {
              const text = [
                `Merchant Ops Resolver: unit economics measured over ${m?.runs ?? 0} runs`,
                `- Cost per case, all in (tool calls, compute, model tokens): ${fmtUsd(measuredCost)}`,
                `- Average time to close a case: ${fmtMs(m?.avgDurationMs ?? 0)}`,
                `- Cases closed without a human in this test mix: ${Math.round((m?.autoResolveRate ?? 0) * 100)}% (not a real-world rate)`,
                `- Human baseline per case: ${a.humanMinutesPerCase} min at $${a.humanUsdPerHour}/h = ${fmtUsd(human)}`,
                `- Price: $${a.priceUsdPerResolvedCase} per resolved case, $${a.priceUsdPerEscalatedCase} per escalated case, $${a.platformUsdPerMerchantMonth} per merchant per month`,
                `- Scenario: ${merchants} merchants, ${casesPer} cases each per month, ${Math.round(autoRate * 100)}% resolved, so revenue ${fmtUsd(revenue)} and gross margin ${(margin * 100).toFixed(1)}%`,
              ].join("\n");
              try {
                await navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              } catch {
                // clipboard can be blocked by the browser
              }
            }}
            className="label shrink-0 rounded-[2px] border border-line px-3 py-2 transition-colors hover:border-lime hover:text-lime"
          >
            {copied ? "Copied" : "Copy inputs for cfo.ai"}
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone = false }: { label: string; value: string; sub: string; tone?: boolean }) {
  return (
    <div className="bg-[rgb(11_14_12)] px-4 py-4">
      <p className="label text-mute">{label}</p>
      <p className={`display mt-2 text-3xl ${tone ? "tone" : ""}`}>{value}</p>
      <p className="mt-1 font-mono text-[11px] text-mute">{sub}</p>
    </div>
  );
}

function Compare({ label, cold, warm, fmt }: { label: string; cold: number | null; warm: number | null; fmt: (v: number) => string }) {
  const max = Math.max(cold ?? 0, warm ?? 0, 1);
  const row = (name: string, value: number | null, className: string) => (
    <div className="grid grid-cols-[3.2rem_1fr_4.5rem] items-center gap-3">
      <span className="text-mute">{name}</span>
      <span className="h-2.5 bg-white/[0.06]">
        {value !== null && <span className={`block h-full ${className}`} style={{ width: `${(value / max) * 100}%` }} />}
      </span>
      <span className="text-right tabular-nums">{value === null ? "no runs" : fmt(value)}</span>
    </div>
  );
  return (
    <div>
      <p className="mb-1.5 text-ink/80">{label}</p>
      <div className="space-y-1.5">
        {row("cold", cold, "bg-ember/80")}
        {row("warm", warm, "bg-lime")}
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="flex justify-between font-mono text-[12px]">
        <span className="text-mute">{label}</span>
        <span className="tabular-nums">{value.toLocaleString("en-US")}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full accent-[#c8f53c]" />
    </label>
  );
}
