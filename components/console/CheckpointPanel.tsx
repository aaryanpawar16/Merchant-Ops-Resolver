"use client";

import { ShieldCheck, ShieldAlert } from "lucide-react";
import { AGENT_LABEL, fmtMs } from "@/components/console/format";
import type { LogLine } from "@/components/console/runState";
import type { Checkpoint } from "@/lib/engine/types";

// The context behind every decision is saved and hash-linked, and a retry resumes from it.
export function CheckpointPanel({ checkpoints, logs, chainValid }: { checkpoints: Checkpoint[]; logs: LogLine[]; chainValid: boolean | null }) {
  const resumedFrom = new Set<string>();
  for (const line of logs) {
    const hit = line.text.match(/resumed from (ckpt_\w+)/);
    if (hit) resumedFrom.add(hit[1]);
  }

  return (
    <div>
      <div className="label flex items-center justify-between gap-4 border-b border-line px-4 py-3 text-mute">
        <span>{checkpoints.length} checkpoints, each hash-linked to its parent</span>
        {chainValid !== null && (
          <span className={`flex items-center gap-1.5 ${chainValid ? "text-lime" : "text-ember"}`}>
            {chainValid ? <ShieldCheck aria-hidden="true" className="size-3.5" /> : <ShieldAlert aria-hidden="true" className="size-3.5" />}
            {chainValid ? "chain verified" : "chain broken"}
          </span>
        )}
      </div>

      <ol className="max-h-[26rem] overflow-y-auto px-4 py-4">
        {checkpoints.length === 0 && <li className="font-mono text-[12.5px] text-mute">Checkpoints appear as each agent finishes a step.</li>}
        {checkpoints.map((c, i) => (
          <li key={c.id} className="relative grid grid-cols-[1.25rem_1fr] gap-x-3 pb-4 last:pb-0">
            <span aria-hidden="true" className="relative flex justify-center">
              <span className={`mt-1.5 size-2.5 ${resumedFrom.has(c.id) ? "bg-lime" : "bg-white/40"}`} />
              {i < checkpoints.length - 1 && <span className="absolute top-4 bottom-[-1rem] w-px bg-white/15" />}
            </span>
            <div>
              <p className="flex flex-wrap items-baseline gap-x-3 font-mono text-[12.5px]">
                <span className="text-ink">{c.id}</span>
                <span className="text-lime">{c.label}</span>
                <span className="text-mute">
                  {AGENT_LABEL[c.agent]} at {fmtMs(c.atMs)}
                </span>
                {resumedFrom.has(c.id) && <span className="label rounded-[2px] border border-lime/60 px-1.5 py-0.5 text-lime">resumed from here</span>}
              </p>
              <p className="font-mono text-[11px] break-all text-mute" title={c.hash}>
                sha256 {c.hash.slice(0, 32)}... {c.parentId ? `parent ${c.parentId}` : "genesis"}
              </p>
              <details className="mt-1">
                <summary className="label cursor-pointer text-mute hover:text-ink">saved state</summary>
                <pre className="mt-1 max-h-40 overflow-auto rounded-[2px] border border-line bg-black/30 p-2 font-mono text-[11px] leading-relaxed text-mute">
                  {JSON.stringify(c.state, null, 2)}
                </pre>
              </details>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
