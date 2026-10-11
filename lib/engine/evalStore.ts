import { randomBytes } from "node:crypto";
import { readJson, writeJson } from "@/lib/engine/persist";
import type { StoredBatch } from "@/lib/engine/types";

export type EvalMode = "clean" | "timeout" | "ambiguous";

// One scorecard run. Kept so runs can be compared over time: label a run "before" and another "after".
export type EvalRecord = {
  id: string;
  batchId: string;
  at: string;
  label: string;
  mode: EvalMode;
  unsafeRetry: boolean;
  cases: number;
  labelled: number;
  matched: number;
  unsafe: number;
  recoveries: number;
  avgToolCalls: number;
  costUsd: number;
  wallMs: number;
};

const FILE = "evals.json";
const KEEP = 20;
const g = globalThis as unknown as { __evals?: EvalRecord[] };
const all = () => (g.__evals ??= readJson<EvalRecord[]>(FILE, []));

export const evalStore = {
  list: () => all(),
  record(batch: StoredBatch, mode: EvalMode, label: string): EvalRecord {
    const s = batch.summary;
    const record: EvalRecord = {
      id: `eval_${randomBytes(3).toString("hex")}`,
      batchId: batch.id,
      at: new Date().toISOString(),
      label: label.trim().slice(0, 60) || "unlabelled run",
      mode,
      unsafeRetry: batch.options.unsafeRetry,
      cases: s.processed,
      labelled: s.labelled,
      matched: s.matched,
      unsafe: s.unsafe,
      recoveries: s.recoveries,
      avgToolCalls: batch.results.reduce((sum, r) => sum + r.toolCalls, 0) / Math.max(batch.results.length, 1),
      costUsd: s.costUsd,
      wallMs: s.wallMs,
    };
    const list = all();
    list.unshift(record);
    list.length = Math.min(list.length, KEEP);
    writeJson(FILE, list);
    return record;
  },
};
