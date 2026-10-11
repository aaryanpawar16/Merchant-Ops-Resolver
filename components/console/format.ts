import type { AgentId } from "@/lib/engine/types";

export const AGENT_LABEL: Record<AgentId, string> = {
  coordinator: "Coordinator",
  investigation: "Investigation",
  resolution: "Resolution",
  closure: "Closure",
};

export function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
}

export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function fmtUsd(usd: number): string {
  if (usd < 0) return `-${fmtUsd(-usd)}`;
  if (usd === 0) return "$0";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 100) return `$${usd.toFixed(2)}`;
  return `$${Math.round(usd).toLocaleString("en-US")}`;
}

export const OUTCOME_LABEL: Record<string, string> = {
  resolved: "Resolved and verified",
  escalated: "Escalated to a human",
  failed: "Could not complete",
  not_found: "Case not found",
  needs_info: "Needs a transaction id",
};
