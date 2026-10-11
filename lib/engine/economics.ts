import type { Cost, RunSummary } from "@/lib/engine/types";

// Every number here is an assumption, not a measurement. Edit them to match the real business.
// Measured values (tool calls, tokens, duration) come from actual runs; prices turn them into dollars.
export const ASSUMPTIONS = {
  // Local llama2 costs nothing per token, so tokens are priced at a typical hosted 7B rate.
  llmUsdPerMTokIn: 0.2,
  llmUsdPerMTokOut: 0.2,
  infraUsdPerToolCall: 0.0004,
  computeUsdPerSecond: 0.00002,
  // What one routine case costs today with a human working across dashboards.
  humanMinutesPerCase: 38,
  humanUsdPerHour: 8,
  // Outcome-based pricing, from the cfo.ai business plan. A merchant pays when a case is fixed, and
  // pays less when it is handed back to their own team.
  priceUsdPerResolvedCase: 1.5,
  priceUsdPerEscalatedCase: 0.375,
  platformUsdPerMerchantMonth: 1,
  // The plan sends a share of cases to a stronger hosted model.
  hostedModelShare: 0.1,
  hostedModelUsdPerCase: 0.1,
} as const;

// Fixed costs, hiring and runway live in the cfo.ai plan, not here.
export const PLAN_URL = "https://cfo.ai/s/zjvRY4EQYV-5T8uH";

export const HUMAN_USD_PER_CASE = (ASSUMPTIONS.humanMinutesPerCase / 60) * ASSUMPTIONS.humanUsdPerHour;

export function emptyCost(): Cost {
  return { llmUsd: 0, infraUsd: 0, totalUsd: 0, tokensIn: 0, tokensOut: 0, llmCalls: 0, toolCalls: 0 };
}

export function llmCost(tokensIn: number, tokensOut: number): number {
  return (tokensIn * ASSUMPTIONS.llmUsdPerMTokIn + tokensOut * ASSUMPTIONS.llmUsdPerMTokOut) / 1_000_000;
}

export type EconomicsSnapshot = {
  assumptions: typeof ASSUMPTIONS;
  humanUsdPerCase: number;
  measured: {
    runs: number;
    resolved: number;
    escalated: number;
    failed: number;
    autoResolveRate: number;
    avgCostUsd: number;
    avgDurationMs: number;
    avgToolCalls: number;
    totalCostUsd: number;
    humanCostAvoidedUsd: number;
    coldAvgToolCalls: number | null;
    warmAvgToolCalls: number | null;
    coldAvgDurationMs: number | null;
    warmAvgDurationMs: number | null;
  };
  recent: RunSummary[];
};

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function snapshot(runs: RunSummary[]): EconomicsSnapshot {
  // Only cases the system really handled count. Unknown transactions say nothing about cost.
  const real = runs.filter((r) => r.outcome !== "not_found" && r.outcome !== "needs_info");
  const resolved = real.filter((r) => r.outcome === "resolved");
  const cold = real.filter((r) => !r.memoryHit);
  const warm = real.filter((r) => r.memoryHit);
  const totalCostUsd = real.reduce((sum, r) => sum + r.costUsd, 0);
  return {
    assumptions: ASSUMPTIONS,
    humanUsdPerCase: HUMAN_USD_PER_CASE,
    measured: {
      runs: real.length,
      resolved: resolved.length,
      escalated: real.filter((r) => r.outcome === "escalated").length,
      failed: real.filter((r) => r.outcome === "failed").length,
      autoResolveRate: real.length ? resolved.length / real.length : 0,
      avgCostUsd: real.length ? totalCostUsd / real.length : 0,
      avgDurationMs: avg(real.map((r) => r.durationMs)) ?? 0,
      avgToolCalls: avg(real.map((r) => r.toolCalls)) ?? 0,
      totalCostUsd,
      humanCostAvoidedUsd: resolved.length * HUMAN_USD_PER_CASE - totalCostUsd,
      coldAvgToolCalls: avg(cold.map((r) => r.toolCalls)),
      warmAvgToolCalls: avg(warm.map((r) => r.toolCalls)),
      coldAvgDurationMs: avg(cold.map((r) => r.durationMs)),
      warmAvgDurationMs: avg(warm.map((r) => r.durationMs)),
    },
    recent: runs.slice(0, 8),
  };
}
