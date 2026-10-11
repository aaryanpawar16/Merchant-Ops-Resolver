"use client";

import { useCallback, useReducer, useRef } from "react";
import { setCase } from "@/lib/caseStatus";
import type { RunEvent, StoredRun } from "@/lib/engine/types";
import { initialState, reducer } from "@/components/console/runState";

export type StartOptions = { instruction: string; chaos: boolean; llm: boolean };

// Starts a case, reads the server-sent event stream, and feeds every event into the run state.
export function useRunner() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const controller = useRef<AbortController | null>(null);

  const apply = useCallback((event: RunEvent) => {
    if (event.type === "status") setCase(event.status, event.tone, event.repair);
    dispatch({ type: "event", event });
  }, []);

  const start = useCallback(
    async (options: StartOptions) => {
      controller.current?.abort();
      const ac = new AbortController();
      controller.current = ac;
      dispatch({ type: "reset" });
      setCase("Case received", "fault", 0);

      try {
        const res = await fetch("/api/runs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(options),
          signal: ac.signal,
        });
        if (!res.ok || !res.body) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          dispatch({ type: "error", message: body?.error ?? `The server answered ${res.status}.` });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let split: number;
          while ((split = buffer.indexOf("\n\n")) >= 0) {
            const line = buffer.slice(0, split).replace(/^data: /, "");
            buffer = buffer.slice(split + 2);
            if (line) apply(JSON.parse(line) as RunEvent);
          }
        }
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        dispatch({ type: "error", message: "Lost the connection to the server." });
      }
    },
    [apply],
  );

  // Opens a finished run from its shared link.
  const load = useCallback(async (id: string) => {
    const res = await fetch(`/api/runs/${encodeURIComponent(id)}`);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      dispatch({ type: "error", message: body?.error ?? "Could not open that run." });
      return false;
    }
    const run = (await res.json()) as StoredRun;
    dispatch({ type: "load", events: run.events });
    const last = [...run.events].reverse().find((e) => e.type === "status");
    if (last && last.type === "status") setCase(last.status, last.tone, last.repair);
    return true;
  }, []);

  return { state, start, load };
}
