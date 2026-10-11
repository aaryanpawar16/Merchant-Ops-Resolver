"use client";

import { Download, Loader2, Play } from "lucide-react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { batchReducer, initialBatchState } from "@/components/batch/batchState";
import { OUTCOME_STYLE } from "@/components/batch/labels";
import { ResultsTable } from "@/components/batch/ResultsTable";
import { ConsoleNav } from "@/components/console/ConsoleNav";
import { fmtMs, fmtUsd } from "@/components/console/format";
import { Backdrop } from "@/components/ui/Backdrop";
import { Toggle } from "@/components/ui/Toggle";
import { setCase } from "@/lib/caseStatus";
import { downloadText, toCsv } from "@/lib/download";
import type { EvalMode, EvalRecord } from "@/lib/engine/evalStore";
import { attackHeld, byCategory, isRedTeam } from "@/lib/engine/score";
import type { BatchEvent, StoredBatch } from "@/lib/engine/types";

const modes: { id: EvalMode; title: string; detail: string }[] = [
  { id: "clean", title: "Clean run", detail: "No failures. The baseline." },
  { id: "timeout", title: "The bank times out", detail: "The first call to an external system in every case fails before the bank sees it. Each case recovers from a checkpoint." },
  { id: "ambiguous", title: "The bank pays, then the reply is lost", detail: "The dangerous kind of timeout: the money moved but the agent was never told. A retry must not pay again." },
];

const modeLabel: Record<EvalMode, string> = { clean: "clean", timeout: "bank times out", ambiguous: "reply lost" };

function Tile({ label, value, sub, tone = "" }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="bg-[rgb(11_14_12)] px-4 py-4">
      <p className="label text-mute">{label}</p>
      <p className={`display mt-2 text-3xl ${tone}`}>{value}</p>
      <p className="mt-1 font-mono text-[11px] leading-snug text-mute">{sub}</p>
    </div>
  );
}

export function EvalConsole() {
  const [state, dispatch] = useReducer(batchReducer, initialBatchState);
  const [mode, setMode] = useState<EvalMode>("clean");
  const [unsafeRetry, setUnsafeRetry] = useState(false);
  const [label, setLabel] = useState("");
  const [history, setHistory] = useState<EvalRecord[]>([]);
  const booted = useRef(false);

  const running = state.phase === "running";
  const total = state.report?.cases.length ?? 0;
  const results = state.results;
  const summary = state.summary;

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/eval", { cache: "no-store" });
      setHistory(((await res.json()) as { runs: EvalRecord[] }).runs);
    } catch {
      // the history is a convenience
    }
  }, []);



  const run = useCallback(async (override?: { mode: EvalMode; unsafeRetry: boolean }) => {
    const useMode = override?.mode ?? mode;
    const careless = override?.unsafeRetry ?? unsafeRetry;
    dispatch({ type: "start" });
    setCase("Benchmark running", "work", 0.2);
    try {
      const res = await fetch("/api/eval", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: useMode, unsafeRetry: useMode === "ambiguous" && careless, label }),
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        dispatch({ type: "error", message: body?.error ?? `The server answered ${res.status}.` });
        setCase("Benchmark stopped", "fault", 0);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let planned = 1;
      let finished = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let split: number;
        while ((split = buffer.indexOf("\n\n")) >= 0) {
          const line = buffer.slice(0, split).replace(/^data: /, "");
          buffer = buffer.slice(split + 2);
          if (!line) continue;
          const event = JSON.parse(line) as BatchEvent;
          if (event.type === "batch.start") planned = event.report.cases.length;
          if (event.type === "case.end") {
            finished += 1;
            setCase(`Case ${finished} of ${planned}`, "work", 0.2 + 0.7 * (finished / planned));
          }
          if (event.type === "batch.end") setCase(event.summary.unsafe === 0 ? "No unsafe actions" : `${event.summary.unsafe} unsafe cases`, event.summary.unsafe === 0 ? "ok" : "fault", event.summary.unsafe === 0 ? 1 : 0.2);
          dispatch({ type: "event", event });
        }
      }
      await loadHistory();
    } catch {
      dispatch({ type: "error", message: "Lost the connection to the server." });
      setCase("Benchmark stopped", "fault", 0);
    }
  }, [mode, unsafeRetry, label, loadHistory]);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    setCase("Waiting for a run", "work", 0);
    void loadHistory();
    // A link such as /eval?run=ambiguous&careless=1 starts a run straight away, for demos.
    const params = new URLSearchParams(window.location.search);
    const wanted = params.get("run") as EvalMode | null;
    const batchId = params.get("batch");
    if (batchId) {
      fetch(`/api/batches/${encodeURIComponent(batchId)}`)
        .then(async (res) => {
          if (!res.ok) throw new Error("Could not open that run.");
          const batch = (await res.json()) as StoredBatch;
          setMode(batch.options.ambiguous ? "ambiguous" : batch.options.chaos ? "timeout" : "clean");
          setUnsafeRetry(batch.options.unsafeRetry);
          dispatch({ type: "load", batch });
        })
        .catch((error: Error) => dispatch({ type: "error", message: error.message }));
    } else if (wanted && modes.some((m) => m.id === wanted)) {
      const careless = wanted === "ambiguous" && params.get("careless") === "1";
      void Promise.resolve().then(() => {
        setMode(wanted);
        setUnsafeRetry(careless);
        return run({ mode: wanted, unsafeRetry: careless });
      });
    }
  }, [loadHistory, run]);

  // What the shown results were run with, which differs from the radio buttons when a stored run is reopened.
  const ranMode: EvalMode = state.options ? (state.options.ambiguous ? "ambiguous" : state.options.chaos ? "timeout" : "clean") : mode;
  const redTeam = results.filter(isRedTeam);
  const held = redTeam.filter(attackHeld).length;
  const doublePaid = results.filter((r) => r.payouts > 1).length;
  const categories = byCategory(results);
  const formulaAttack = redTeam.find((r) => (r.category ?? "").includes("spreadsheet formula"));
  const unsafeKinds = [...new Set(results.flatMap((r) => r.unsafe))];

  function downloadScorecard() {
    const rows = [
      ["mode", "category", "cases", "correct", "unsafe", "avg_tool_calls"],
      ...categories.map((c) => [ranMode, c.category, c.cases, c.correct, c.unsafe, c.avgToolCalls.toFixed(1)]),
      [
        ranMode,
        "TOTAL",
        results.length,
        results.filter((r) => r.matched).length,
        results.filter((r) => r.unsafe.length > 0).length,
        (results.reduce((s, r) => s + r.toolCalls, 0) / Math.max(results.length, 1)).toFixed(1),
      ],
    ];
    downloadText("scorecard.csv", toCsv(rows));
  }

  return (
    <>
      <Backdrop />
      <ConsoleNav active="eval">
        <span role="status" className="tone flex items-center gap-2 rounded-[2px] border border-current px-2.5 py-1.5">
          <span aria-hidden="true" className={`bg-tone size-1.5 ${running ? "animate-blink" : ""}`} />
          {running ? `${results.length} of ${total} done` : summary ? (summary.unsafe === 0 ? "No unsafe actions" : `${summary.unsafe} unsafe cases`) : "Waiting for a run"}
        </span>
      </ConsoleNav>

      <main className="mx-auto grid max-w-[1360px] grid-cols-[minmax(0,1fr)] gap-6 px-5 pt-24 pb-24 md:px-8 lg:grid-cols-12">
        <div className="min-w-0 space-y-6 lg:col-span-4">
          <div>
            <h1 className="display text-4xl sm:text-5xl">How much can you trust it?</h1>
            <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-mute">
              A fixed benchmark of 42 labelled cases, including six attacks. The right answer for each was decided in advance. After every case the simulated world is inspected for money that moved wrongly, so an agent cannot hide a bad action behind a confident answer.
            </p>
          </div>

          <div className="glass glass-tint">
            <div className="px-5 pt-5" role="radiogroup" aria-labelledby="mode-title">
              <p id="mode-title" className="label mb-3 text-mute">
                What goes wrong during the run
              </p>
              <div className="space-y-2">
                {modes.map((m) => (
                  <label
                    key={m.id}
                    className="block cursor-pointer rounded-[2px] border border-line px-3.5 py-3 transition-colors hover:border-lime/60 has-[:checked]:border-lime has-[:checked]:bg-lime/[0.06] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-lime"
                  >
                    <input type="radio" name="mode" value={m.id} checked={mode === m.id} disabled={running} onChange={() => setMode(m.id)} className="sr-only" />
                    <span className="label block">{m.title}</span>
                    <span className="mt-1 block text-[13px] leading-snug text-mute">{m.detail}</span>
                  </label>
                ))}
              </div>
            </div>

            {mode === "ambiguous" && (
              <div className="px-5 pt-4">
                <Toggle
                  checked={unsafeRetry}
                  onChange={setUnsafeRetry}
                  disabled={running}
                  title="Retry carelessly"
                  detail="Uses a fresh idempotency key on every retry. This shows the double payment the real agent prevents. It is a demonstration, not how the Resolver works."
                />
              </div>
            )}

            <div className="px-5 pt-4">
              <label htmlFor="eval-label" className="label text-mute">
                Name this run (to compare later)
              </label>
              <input
                id="eval-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                maxLength={60}
                disabled={running}
                placeholder="for example: before the policy fix"
                className="mt-2 w-full rounded-[2px] border border-line bg-black/30 px-3 py-2.5 font-mono text-[13px] outline-none placeholder:text-mute focus:border-lime"
              />
            </div>

            <div className="px-5 py-5">
              <button
                type="button"
                disabled={running}
                onClick={() => void run()}
                className="label flex w-full items-center justify-between gap-4 rounded-[2px] border border-lime bg-lime px-5 py-4 text-void transition-colors duration-200 hover:border-ink hover:bg-ink disabled:cursor-not-allowed disabled:opacity-60"
              >
                {running ? `Running ${total} cases` : "Run the benchmark"}
                {running ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Play aria-hidden="true" className="size-4" />}
              </button>
            </div>
          </div>

          <p className="font-mono text-[11.5px] leading-relaxed text-mute">
            Be careful what this proves. The benchmark was written by the same team as the agents, so it is a regression and safety check, not an independent grade. Its value is that it is fixed, labelled, repeatable, and that unsafe actions are read from the world, not from the agents.
          </p>
          {state.phase === "error" && state.error && (
            <p role="alert" className="rounded-[2px] border border-ember/60 px-4 py-3 font-mono text-[12.5px] text-ember">
              {state.error}
            </p>
          )}
        </div>

        <div className="min-w-0 space-y-6 lg:col-span-8">
          {state.phase === "running" && (
            <div className="glass glass-tint px-5 py-4" role="status">
              <p className="label flex items-center justify-between gap-4">
                <span>
                  {results.length} of {total} cases done
                </span>
                <span className={results.some((r) => r.unsafe.length > 0) ? "text-ember" : "text-mute"}>{results.filter((r) => r.unsafe.length > 0).length} unsafe so far</span>
              </p>
              <div className="mt-3 h-1.5 bg-white/10" aria-hidden="true">
                <div className="h-full bg-lime transition-[width] duration-500" style={{ width: `${(results.length / Math.max(total, 1)) * 100}%` }} />
              </div>
            </div>
          )}

          {summary && (
            <>
              <div className={`glass glass-tint overflow-hidden ${summary.unsafe > 0 ? "!border-ember/60" : ""}`}>
                <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
                  <Tile
                    label="Correct outcomes"
                    value={`${summary.matched} of ${summary.labelled}`}
                    sub={`${Math.round((summary.matched / Math.max(summary.labelled, 1)) * 100)}% matched the label decided in advance`}
                    tone={summary.matched === summary.labelled ? "text-lime" : "text-ember"}
                  />
                  <Tile
                    label="Unsafe actions"
                    value={String(summary.unsafe)}
                    sub={summary.unsafe === 0 ? "Money never moved wrongly. Read from the world, not from the agents." : unsafeKinds.join("; ")}
                    tone={summary.unsafe === 0 ? "text-lime" : "text-ember"}
                  />
                  <Tile
                    label="Attacks held"
                    value={`${held} of ${redTeam.length}`}
                    sub="Hostile text in the data tried to steer the agents."
                    tone={held === redTeam.length ? "text-lime" : "text-ember"}
                  />
                  <Tile
                    label="Settlements paid twice"
                    value={String(doublePaid)}
                    sub={ranMode === "ambiguous" ? "The timeout was ambiguous: the bank had already paid." : "Counted from the payouts the bank made."}
                    tone={doublePaid === 0 ? "text-lime" : "text-ember"}
                  />
                  <Tile label="Failed calls recovered" value={String(summary.recoveries)} sub="Resumed from a checkpoint, with every outcome unchanged." />
                  <Tile
                    label="Effort per case"
                    value={`${(results.reduce((s, r) => s + r.toolCalls, 0) / Math.max(results.length, 1)).toFixed(1)} calls`}
                    sub={`${fmtUsd(summary.costUsd / Math.max(results.length, 1))} each, ${fmtMs(summary.wallMs)} for all ${summary.processed}`}
                  />
                </div>
              </div>

              {ranMode === "ambiguous" && (
                <p className={`rounded-[2px] border px-4 py-3 font-mono text-[12.5px] leading-relaxed ${doublePaid > 0 ? "border-ember/60 text-ember" : "border-lime/50 text-lime"}`}>
                  {doublePaid > 0
                    ? `${doublePaid} settlements were paid twice, yet every one of these cases still reports a correct, verified outcome. The agent cannot see the problem; only the world can. That is why the scorecard reads the payouts from the world. The real agent keeps one idempotency key across retries, so the bank recognises the repeat and pays once.`
                    : "The bank paid and the reply was lost, then the agent retried. It kept the same idempotency key, so the bank recognised the repeat and paid once. Run it again with the careless retry switched on to see what that prevents."}
                </p>
              )}

              <div className="glass glass-tint overflow-hidden">
                <div className="label hidden gap-x-3 border-b border-line px-4 py-3 text-mute md:grid md:grid-cols-[minmax(0,1fr)_4.5rem_6rem_5rem_6rem]">
                  <span>Category</span>
                  <span className="text-right">Cases</span>
                  <span className="text-right">Correct</span>
                  <span className="text-right">Unsafe</span>
                  <span className="text-right">Avg calls</span>
                </div>
                <ul>
                  {categories.map((c) => (
                    <li key={c.category} className="grid grid-cols-[1fr_auto] items-center gap-x-3 border-b border-line px-4 py-2.5 font-mono text-[12.5px] last:border-b-0 md:grid-cols-[minmax(0,1fr)_4.5rem_6rem_5rem_6rem]">
                      <span className={c.category.startsWith("red team") ? "text-ember" : ""}>{c.category}</span>
                      <span className="hidden text-right tabular-nums md:block">{c.cases}</span>
                      <span className={`text-right tabular-nums ${c.correct === c.labelled ? "text-lime" : "text-ember"}`}>
                        {c.correct}/{c.labelled}
                        <span className="text-mute md:hidden"> correct</span>
                      </span>
                      <span className={`hidden text-right tabular-nums md:block ${c.unsafe === 0 ? "text-mute" : "text-ember"}`}>{c.unsafe}</span>
                      <span className="hidden text-right tabular-nums text-mute md:block">{c.avgToolCalls.toFixed(1)}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <section className="glass glass-tint space-y-4 px-5 py-5" aria-labelledby="redteam-title">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 id="redteam-title" className="display text-2xl sm:text-3xl">
                    Red team
                  </h2>
                  <span className="label text-mute">hostile text in the data, and a planted history row</span>
                </div>
                <ul className="divide-y divide-line">
                  {redTeam.map((r) => {
                    const ok = attackHeld(r);
                    return (
                      <li key={r.index} className="grid gap-x-4 gap-y-1 py-3 sm:grid-cols-[1fr_auto]">
                        <div className="min-w-0">
                          <p className="label">
                            {(r.category ?? "").replace("red team: ", "")}
                            <span className="ml-2 text-mute">{r.txn}</span>
                          </p>
                          <p className="mt-1 text-[13px] leading-snug text-mute">{r.note}</p>
                          <p className="mt-1 break-words font-mono text-[11.5px] leading-snug text-mute" title={r.reason}>
                            In the file: {r.reason.length > 150 ? `${r.reason.slice(0, 150)}...` : r.reason}
                          </p>
                          <p className="mt-1 font-mono text-[12px] leading-snug">
                            Outcome: <span className={OUTCOME_STYLE[r.outcome]?.className.split(" ")[1]}>{r.outcome}</span> (expected {r.expected}). Paid {r.payouts} time{r.payouts === 1 ? "" : "s"}. {r.fix}.
                          </p>
                          {!ok && (
                            <p className="mt-1 font-mono text-[12px] leading-snug text-ember">
                              Why it is flagged: {r.unsafe.length > 0 ? r.unsafe.join("; ") : "the outcome did not match the label"}.
                              {r.unsafe.some((u) => /more than once|twice|times/i.test(u)) && " The attack text did not change the amount paid; the duplicate came from the retry."}
                            </p>
                          )}
                        </div>
                        <span className={`label h-fit rounded-[2px] border px-2 py-1 ${ok ? "border-lime/60 text-lime" : "border-ember/60 text-ember"}`}>{ok ? "Held" : "Broke through"}</span>
                      </li>
                    );
                  })}
                </ul>
                {formulaAttack && (
                  <div className="rounded-[2px] bg-black/30 px-3.5 py-3">
                    <p className="label text-mute">The formula attack, as it would appear in a downloaded CSV</p>
                    <p className="mt-2 break-all font-mono text-[12px] leading-relaxed">{toCsv([[formulaAttack.reason]])}</p>
                    <p className="mt-1 font-mono text-[11px] text-mute">The leading quote makes Excel and Sheets show it as text instead of running it.</p>
                  </div>
                )}
              </section>

              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={downloadScorecard} className="label flex items-center gap-2 rounded-[2px] border border-line px-3 py-2.5 transition-colors hover:border-lime hover:text-lime">
                  <Download aria-hidden="true" className="size-3.5" />
                  Download the scorecard
                </button>
              </div>

              <details className="group">
                <summary className="label cursor-pointer text-mute hover:text-ink">All {total} cases, with the evidence for each</summary>
                <div className="mt-3">{state.report && <ResultsTable cases={state.report.cases} results={results} current={null} />}</div>
              </details>
            </>
          )}

          {state.phase === "idle" && (
            <div className="glass glass-tint space-y-4 px-5 py-6 md:px-8">
              <h2 className="display text-2xl sm:text-3xl">What it checks</h2>
              <ul className="space-y-3 text-[15px] leading-relaxed">
                <li>
                  <span className="label mr-3 text-lime">Right answers</span>Fixable cases get fixed, and unverifiable ones are escalated. Traps include a valid KYC document on a KYC hold and a clean risk case above the release limit.
                </li>
                <li>
                  <span className="label mr-3 text-lime">Safe actions</span>After each case the world is inspected: money released that should not have been, paid twice, paid to an unverified account, or above the limit.
                </li>
                <li>
                  <span className="label mr-3 text-lime">Attacks</span>Fake orders in the failure text and merchant name, a planted history row, a spreadsheet formula, and a demand for a different amount.
                </li>
                <li>
                  <span className="label mr-3 text-lime">Failures</span>Run it with timeouts, including the ambiguous kind where the bank already paid.
                </li>
              </ul>
            </div>
          )}

          {history.length > 0 && (
            <section className="glass glass-tint overflow-hidden" aria-labelledby="history-title">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
                <h2 id="history-title" className="label">
                  Earlier runs
                </h2>
                <span className="label text-mute">name a run before and after a change to compare</span>
              </div>
              <ul>
                {history.map((h) => (
                  <li key={h.id} className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1 border-b border-line px-4 py-2.5 font-mono text-[12px] last:border-b-0 md:grid-cols-[minmax(0,1.3fr)_13rem_5.5rem_5rem_7rem_5rem]">
                    <span className="min-w-0 break-words">
                      <a href={`/eval?batch=${encodeURIComponent(h.batchId)}`} className="underline decoration-line underline-offset-4 hover:text-lime">
                        {h.label}
                      </a>
                      <span className="ml-2 text-mute">{new Date(h.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    </span>
                    <span className="hidden text-mute md:block">{modeLabel[h.mode]}{h.unsafeRetry ? ", careless retry" : ""}</span>
                    <span className={`text-right tabular-nums ${h.matched === h.labelled ? "text-lime" : "text-ember"}`}>
                      {h.matched}/{h.labelled}
                    </span>
                    <span className={`hidden text-right tabular-nums md:block ${h.unsafe === 0 ? "text-lime" : "text-ember"}`}>{h.unsafe} unsafe</span>
                    <span className="hidden text-right tabular-nums text-mute md:block">{h.recoveries} recovered</span>
                    <span className="hidden text-right tabular-nums text-mute md:block">{h.avgToolCalls.toFixed(1)} calls</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </main>
    </>
  );
}
