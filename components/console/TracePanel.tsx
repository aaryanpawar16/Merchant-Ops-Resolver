"use client";

import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { AGENT_LABEL, fmtMs, fmtUsd } from "@/components/console/format";
import type { NeatlogsExport, Span, SpanKind } from "@/lib/engine/types";

const kindBar: Record<SpanKind, string> = {
  agent: "bg-white/25",
  llm: "bg-teal",
  tool: "bg-lime/80",
  checkpoint: "bg-ink",
  decision: "bg-ink/70",
};

const kindLabel: Record<SpanKind, string> = {
  agent: "agent",
  llm: "llm",
  tool: "tool",
  checkpoint: "checkpoint",
  decision: "decision",
};

// A neatlogs-style waterfall: every agent run, model call, tool call, retry and checkpoint on one timeline.
export function TracePanel({
  spans,
  elapsedMs,
  runId,
  done,
  neatlogs,
}: {
  spans: Span[];
  elapsedMs: number;
  runId: string | null;
  done: boolean;
  neatlogs: NeatlogsExport | null;
}) {
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(() => {
    const byId = new Map(spans.map((s) => [s.id, s]));
    const depth = (s: Span): number => (s.parentId && byId.get(s.parentId) ? depth(byId.get(s.parentId)!) + 1 : 0);
    return spans.map((s) => ({ span: s, depth: depth(s) }));
  }, [spans]);

  const total = Math.max(elapsedMs, ...spans.map((s) => s.endMs ?? s.startMs), 1);
  const errors = spans.filter((s) => s.status === "error").length;
  const tokens = spans.reduce((sum, s) => sum + (s.tokensIn ?? 0) + (s.tokensOut ?? 0), 0);

  return (
    <div>
      <div className="label flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line px-4 py-3 text-mute">
        <span>{spans.length} spans</span>
        <span className={errors ? "text-ember" : ""}>{errors} errors</span>
        <span>{tokens} tokens</span>
        <span className="tabular-nums">{fmtMs(total)} total</span>
        <span className="ml-auto flex items-center gap-4">
          {(Object.keys(kindBar) as SpanKind[]).map((k) => (
            <span key={k} className="hidden items-center gap-1.5 md:flex">
              <span aria-hidden="true" className={`size-2 ${kindBar[k]}`} />
              {kindLabel[k]}
            </span>
          ))}
          {runId && done && (
            <a href={`/api/runs/${runId}/trace`} className="flex items-center gap-1.5 text-ink hover:text-lime" download>
              <Download aria-hidden="true" className="size-3.5" />
              OTLP JSON
            </a>
          )}
        </span>
      </div>

      {done && neatlogs && (
        <p className={`border-b border-line px-4 py-2.5 font-mono text-[12px] ${neatlogs.status === "traced" ? "text-lime" : "text-mute"}`}>
          {neatlogs.status === "traced" && (
            <>
              Traced with neatlogs{neatlogs.traceId ? `, trace ${neatlogs.traceId}` : ""}. Spans are batched and appear in the dashboard within a few seconds.{" "}
              <a href="https://app.neatlogs.com" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink">
                Open the dashboard
              </a>
            </>
          )}
          {neatlogs.status === "disabled" && "neatlogs tracing is off. Set NEATLOGS_API_KEY in .env.local and restart the server to trace each run."}
        </p>
      )}

      <div className="max-h-[26rem] overflow-y-auto py-1">
        {rows.length === 0 && <p className="px-4 py-6 font-mono text-[12.5px] text-mute">No spans yet.</p>}
        {rows.map(({ span, depth }) => {
          const end = span.endMs ?? total;
          const left = (span.startMs / total) * 100;
          const width = Math.max(((end - span.startMs) / total) * 100, span.kind === "checkpoint" ? 0.6 : 0.5);
          const bar = span.status === "error" ? "bg-ember" : span.status === "fallback" ? "bg-ember/50" : kindBar[span.kind];
          const expanded = open === span.id;
          return (
            <div key={span.id}>
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : span.id)}
                aria-expanded={expanded}
                className="grid w-full grid-cols-[minmax(0,8.5rem)_1fr_3.6rem] items-center gap-x-3 px-4 py-[3px] text-left font-mono text-[12px] hover:bg-white/[0.04] sm:grid-cols-[minmax(0,14rem)_1fr_4.2rem] md:grid-cols-[minmax(0,17rem)_1fr_4.5rem]"
              >
                <span className="truncate" style={{ paddingLeft: depth * 12 }}>
                  <span className={span.status === "error" ? "text-ember" : "text-ink/90"}>{span.name}</span>
                </span>
                <span className="relative h-3 bg-white/[0.05]">
                  <span
                    className={`absolute inset-y-0 ${bar} ${span.endMs === null ? "animate-blink" : ""}`}
                    style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }}
                  />
                </span>
                <span className="text-right text-mute tabular-nums">{span.endMs === null ? "..." : fmtMs(span.endMs - span.startMs)}</span>
              </button>
              {expanded && (
                <div className="mx-4 mb-2 rounded-[2px] border border-line bg-black/30 px-3 py-2 font-mono text-[11.5px] leading-relaxed text-mute">
                  <p>
                    {AGENT_LABEL[span.agent]} / {kindLabel[span.kind]} / status {span.status}
                    {span.costUsd !== undefined && ` / ${fmtUsd(span.costUsd)}`}
                    {span.tokensIn !== undefined && ` / ${span.tokensIn} in, ${span.tokensOut ?? 0} out`}
                  </p>
                  {Object.entries(span.attrs).map(([key, value]) => (
                    <p key={key} className="break-words">
                      <span className="text-ink/70">{key}</span> {String(value)}
                    </p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
