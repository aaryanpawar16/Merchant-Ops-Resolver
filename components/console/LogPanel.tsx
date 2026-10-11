"use client";

import { useEffect, useRef } from "react";
import { AGENT_LABEL } from "@/components/console/format";
import type { LogLine } from "@/components/console/runState";
import type { LogLevel } from "@/lib/engine/types";

const levelStyle: Record<LogLevel, string> = {
  info: "text-ink/80",
  ok: "text-lime",
  warn: "text-ember/90",
  error: "text-ember font-semibold",
};

const levelMark: Record<LogLevel, string> = { info: " ", ok: "+", warn: "!", error: "x" };

export function LogPanel({ logs, running }: { logs: LogLine[]; running: boolean }) {
  const box = useRef<HTMLDivElement>(null);

  // Follow the log while the reader is at the bottom, but never fight a reader who scrolled up.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) el.scrollTop = el.scrollHeight;
  }, [logs.length]);

  return (
    <div ref={box} role="log" aria-live="off" className="max-h-[26rem] overflow-y-auto px-1 py-2 font-mono text-[12.5px] leading-relaxed">
      {logs.length === 0 && <p className="px-3 py-6 text-mute">The run log fills in as the agents work. Pick a case and press Run.</p>}
      {logs.map((line, i) => (
        <div key={i} className="grid grid-cols-[3.2rem_1fr] gap-x-3 rounded-[2px] px-3 py-[3px] hover:bg-white/[0.04] sm:grid-cols-[3.6rem_6.4rem_1fr]">
          <span className="text-mute tabular-nums">{(line.atMs / 1000).toFixed(2)}s</span>
          <span className="hidden text-mute sm:inline">{AGENT_LABEL[line.agent]}</span>
          <span className={levelStyle[line.level]}>
            <span className="mr-2 text-mute sm:hidden">{AGENT_LABEL[line.agent]}</span>
            <span aria-hidden="true" className="mr-2 inline-block w-2 text-center">
              {levelMark[line.level]}
            </span>
            {line.text}
          </span>
        </div>
      ))}
      {running && (
        <div className="px-3 py-1 text-mute">
          <span aria-hidden="true" className="animate-blink inline-block h-3.5 w-2 translate-y-0.5 bg-ink" />
        </div>
      )}
    </div>
  );
}
