import { createHash } from "node:crypto";
import { readJson, writeJson } from "@/lib/engine/persist";
import type { AgentId, Checkpoint } from "@/lib/engine/types";

// --- Per-run checkpoint chain: the context behind each decision is saved, so a retry can resume ----

function link(parentHash: string, agent: string, label: string, state: unknown) {
  return createHash("sha256").update(`${parentHash}|${agent}|${label}|${JSON.stringify(state)}`).digest("hex");
}

export class CheckpointChain {
  readonly items: Checkpoint[] = [];

  create(agent: AgentId, label: string, state: Record<string, unknown>, atMs: number): Checkpoint {
    const parent = this.items.at(-1) ?? null;
    const hash = link(parent?.hash ?? "genesis", agent, label, state);
    const checkpoint: Checkpoint = {
      id: `ckpt_${this.items.length + 1}_${hash.slice(0, 7)}`,
      seq: this.items.length + 1,
      parentId: parent?.id ?? null,
      hash,
      agent,
      label,
      atMs,
      // Copy so later mutation of the live state can never rewrite history.
      state: JSON.parse(JSON.stringify(state)),
    };
    this.items.push(checkpoint);
    return checkpoint;
  }

  latest(): Checkpoint | null {
    return this.items.at(-1) ?? null;
  }

  // Recomputes every hash from genesis. False means a checkpoint was altered or removed.
  verify(): boolean {
    let parentHash = "genesis";
    for (const item of this.items) {
      if (link(parentHash, item.agent, item.label, item.state) !== item.hash) return false;
      parentHash = item.hash;
    }
    return true;
  }
}

// --- Cross-case memory: what past resolved cases teach the Investigation worker -------------------

export type MemoryEntry = {
  pattern: string;
  summary: string;
  // The smallest set of tools that produced the evidence for the diagnosis last time.
  minimalTools: string[];
  fix: string;
  resolvedCases: number;
  lastCheckpoint: string;
  lastResolvedAt: string;
  avgToolCalls: number;
  avgDurationMs: number;
};

const FILE = "memory.json";
const g = globalThis as unknown as { __memory?: Record<string, MemoryEntry> };

// One resolved case is already on record, so the first demo run shows a checkpoint hit.
function seed(): Record<string, MemoryEntry> {
  return {
    IFSC_ACCOUNT_MISMATCH: {
      pattern: "IFSC_ACCOUNT_MISMATCH",
      summary: "Settlement fails because the IFSC on file belongs to a different bank than the account.",
      minimalTools: ["verify_beneficiary"],
      fix: "Verify the beneficiary by penny drop, correct the IFSC, retrigger the settlement.",
      resolvedCases: 3,
      lastCheckpoint: "ckpt_5_9e41c0a",
      lastResolvedAt: "2026-10-02T09:14:00.000Z",
      avgToolCalls: 7,
      avgDurationMs: 6200,
    },
  };
}

function load(): Record<string, MemoryEntry> {
  if (!g.__memory) g.__memory = readJson<Record<string, MemoryEntry> | null>(FILE, null) ?? seed();
  return g.__memory;
}

export const memory = {
  all: () => Object.values(load()),
  find: (pattern: string): MemoryEntry | null => load()[pattern] ?? null,
  learn(entry: { pattern: string; summary: string; minimalTools: string[]; fix: string; checkpoint: string; toolCalls: number; durationMs: number }) {
    const store = load();
    const prev = store[entry.pattern];
    const n = (prev?.resolvedCases ?? 0) + 1;
    store[entry.pattern] = {
      pattern: entry.pattern,
      summary: entry.summary,
      minimalTools: entry.minimalTools,
      fix: entry.fix,
      resolvedCases: n,
      lastCheckpoint: entry.checkpoint,
      lastResolvedAt: new Date().toISOString(),
      avgToolCalls: prev ? Math.round((prev.avgToolCalls * (n - 1) + entry.toolCalls) / n) : entry.toolCalls,
      avgDurationMs: prev ? Math.round((prev.avgDurationMs * (n - 1) + entry.durationMs) / n) : entry.durationMs,
    };
    writeJson(FILE, store);
  },
  // A batch can start from empty memory, then put the saved memory back untouched when it finishes.
  snapshot: (): Record<string, MemoryEntry> => structuredClone(load()),
  restore(saved: Record<string, MemoryEntry>) {
    g.__memory = saved;
    writeJson(FILE, saved);
  },
  reset() {
    g.__memory = seed();
    writeJson(FILE, g.__memory);
  },
  clear() {
    g.__memory = {};
    writeJson(FILE, g.__memory);
  },
};
