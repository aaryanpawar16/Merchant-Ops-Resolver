import { readJson, writeJson } from "@/lib/engine/persist";
import type { RunEvent, RunMeta, RunSummary, StoredRun } from "@/lib/engine/types";

// Runs live in memory and the newest ones are mirrored to disk, so a restart keeps the history.
const FILE = "runs.json";
const KEEP = 80;
const g = globalThis as unknown as { __runs?: Map<string, StoredRun> };

function runs(): Map<string, StoredRun> {
  if (!g.__runs) {
    const saved = readJson<StoredRun[]>(FILE, []);
    // Saved newest first. The Map keeps insertion order oldest first, so insert in reverse.
    g.__runs = new Map([...saved].reverse().map((run) => [run.meta.id, run]));
  }
  return g.__runs;
}

export const store = {
  start(meta: RunMeta): StoredRun {
    const run: StoredRun = { meta, events: [], summary: null };
    runs().set(meta.id, run);
    return run;
  },
  append(id: string, event: RunEvent) {
    runs().get(id)?.events.push(event);
  },
  finish(id: string, summary: RunSummary) {
    const all = runs();
    const run = all.get(id);
    if (run) run.summary = summary;
    while (all.size > KEEP) all.delete(all.keys().next().value as string);
    writeJson(FILE, [...all.values()].reverse());
  },
  get: (id: string) => runs().get(id) ?? null,
  summaries(): RunSummary[] {
    return [...runs().values()]
      .reverse()
      .map((r) => r.summary)
      .filter((s): s is RunSummary => s !== null);
  },
  clear() {
    runs().clear();
    writeJson(FILE, []);
  },
};
