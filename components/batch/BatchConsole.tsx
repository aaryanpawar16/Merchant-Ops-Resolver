"use client";

import { Download, FileUp, Loader2, Play } from "lucide-react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { batchReducer, initialBatchState } from "@/components/batch/batchState";
import { IntakePreview } from "@/components/batch/IntakePreview";
import { humanNextStep, PATTERN_LABEL } from "@/components/batch/labels";
import { ResultsTable } from "@/components/batch/ResultsTable";
import { SummaryCards } from "@/components/batch/SummaryCards";
import { ConsoleNav } from "@/components/console/ConsoleNav";
import { Backdrop } from "@/components/ui/Backdrop";
import { Toggle } from "@/components/ui/Toggle";
import { setCase } from "@/lib/caseStatus";
import { downloadText, toCsv } from "@/lib/download";
import { buildIntake, IntakeError, MAX_BYTES } from "@/lib/engine/intake";
import type { BatchCaseResult, BatchEvent, BatchOptions, StoredBatch } from "@/lib/engine/types";

const SAMPLE_URL = "/sample-settlements.csv";
const SAMPLE_NAME = "sample-settlements.csv";

const columnHelp = [
  ["txn_id", "Required. Also: transaction_id, settlement_id, utr."],
  ["merchant", "Required. Also: merchant_name, business."],
  ["amount", "Required. A number, with or without commas or INR."],
  ["status", "failed, held or settled. Settled rows become history."],
  ["failure_reason", "Why it failed or was held. Used to pick the playbook."],
  ["account_number, ifsc", "The bank details on file. Used to check IFSC mismatches."],
  ["kyc_document, kyc_expiry", "Optional. Evidence for KYC holds."],
  ["volume_vs_baseline, repeat_customer_share, chargeback_rate", "Optional. Evidence for risk holds."],
  ["flagged_txns, flagged_minutes, flagged_amount", "Optional. A suspicious cluster, if there is one."],
  ["expected_outcome", "Optional. resolved or escalated, to score the agents."],
] as const;

// The uploaded file's name without its extension, so downloads are not called "something.csv.csv".
const baseName = (filename: string | undefined) => (filename ?? "batch").replace(/\.[^.]+$/, "");

export function BatchConsole() {
  const [state, dispatch] = useReducer(batchReducer, initialBatchState);
  const [options, setOptions] = useState<BatchOptions>({ chaos: false, llm: false, freshMemory: true, ambiguous: false, unsafeRetry: false });
  const [llm, setLlm] = useState<{ ready: boolean | null; model: string }>({ ready: null, model: "llama2" });
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const booted = useRef(false);

  const running = state.phase === "running";
  const cases = state.report?.cases ?? [];
  const total = cases.length;

  // Reads the file in the browser and shows what was understood. The server checks it again before running.
  const accept = useCallback((fileName: string, text: string) => {
    try {
      const { report } = buildIntake(text, fileName);
      dispatch({ type: "file", fileName, text, report });
      setCase("File ready", "work", 0.15);
      return true;
    } catch (error) {
      dispatch({ type: "error", message: error instanceof IntakeError ? error.message : "That file could not be read.", fileName });
      setCase("File not usable", "fault", 0);
      return false;
    }
  }, []);

  const run = useCallback(async (fileName: string, text: string, opts: BatchOptions) => {
    dispatch({ type: "start" });
    setCase("Batch running", "work", 0.2);
    try {
      const res = await fetch("/api/batches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, filename: fileName, ...opts }),
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        dispatch({ type: "error", message: body?.error ?? `The server answered ${res.status}.` });
        setCase("Batch stopped", "fault", 0);
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
            setCase(`Case ${finished} of ${planned} done`, "work", 0.2 + 0.7 * (finished / planned));
          }
          if (event.type === "batch.end") setCase("Batch complete", "ok", 1);
          dispatch({ type: "event", event });
        }
      }
    } catch {
      dispatch({ type: "error", message: "Lost the connection to the server." });
      setCase("Batch stopped", "fault", 0);
    }
  }, []);

  const loadSample = useCallback(async () => {
    try {
      const res = await fetch(SAMPLE_URL);
      const text = await res.text();
      return accept(SAMPLE_NAME, text) ? text : null;
    } catch {
      dispatch({ type: "error", message: "Could not load the sample file." });
      return null;
    }
  }, [accept]);

  async function onFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (file.size > MAX_BYTES) {
      dispatch({ type: "error", message: `That file is larger than ${Math.round(MAX_BYTES / 1000)} KB. Split it and upload the parts.`, fileName: file.name });
      return;
    }
    accept(file.name, await file.text());
  }

  // Shareable links: ?demo=1 loads the sample and runs it, ?batch=ID reopens a finished batch.
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    fetch("/api/status", { cache: "no-store" })
      .then((res) => res.json())
      .then((body: { available: boolean; model: string }) => setLlm({ ready: body.available, model: body.model }))
      .catch(() => setLlm({ ready: false, model: "llama2" }));

    const params = new URLSearchParams(window.location.search);
    const batchId = params.get("batch");
    if (batchId) {
      fetch(`/api/batches/${encodeURIComponent(batchId)}`)
        .then(async (res) => {
          if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Could not open that batch.");
          dispatch({ type: "load", batch: (await res.json()) as StoredBatch });
          setCase("Batch complete", "ok", 1);
        })
        .catch((error: Error) => dispatch({ type: "error", message: error.message }));
    } else if (params.get("demo") === "1") {
      void loadSample().then((text) => {
        if (text) void run(SAMPLE_NAME, text, { chaos: false, llm: false, freshMemory: true, ambiguous: false, unsafeRetry: false });
      });
    }
  }, [loadSample, run]);


  function downloadResults() {
    const rows = [
      ["txn", "merchant", "amount_inr", "issue", "outcome", "root_cause", "evidence", "what_the_agents_did", "check_afterwards", "email_subject", "tool_calls", "failed_calls_recovered", "time_ms", "cost_usd", "reused_playbook", "expected_outcome", "matched", "run_id"],
      ...state.results.map((r) => [r.txn, r.merchant, r.amount, PATTERN_LABEL[r.pattern], r.outcome, r.rootCause, (r.evidence ?? []).join(" | ") || "none found", r.fix, r.verification, r.subject, r.toolCalls, r.recoveries ?? 0, r.durationMs, r.costUsd.toFixed(5), r.memoryHit, r.expected, r.matched, r.runId]),
    ];
    downloadText(`results-${baseName(state.report?.filename)}.csv`, toCsv(rows));
  }

  function downloadEscalations() {
    const waiting: BatchCaseResult[] = state.results.filter((r) => r.outcome !== "resolved");
    const rows = [
      ["txn", "merchant", "amount_inr", "reason_in_file", "root_cause", "evidence", "what_the_agents_did", "next_step_for_a_person", "run_id"],
      ...waiting.map((r) => [r.txn, r.merchant, r.amount, r.reason, r.rootCause, (r.evidence ?? []).join(" | ") || "none found", r.fix, humanNextStep(r), r.runId]),
    ];
    downloadText(`escalations-${baseName(state.report?.filename)}.csv`, toCsv(rows));
  }

  const doneCount = state.results.length;
  const waitingCount = state.results.filter((r) => r.outcome !== "resolved").length;
  const canRun = (state.phase === "preview" || state.phase === "done") && state.text !== null;

  return (
    <>
      <Backdrop />
      <ConsoleNav active="batch">
        <span role="status" className="tone flex items-center gap-2 rounded-[2px] border border-current px-2.5 py-1.5">
          <span aria-hidden="true" className={`bg-tone size-1.5 ${running ? "animate-blink" : ""}`} />
          {running ? `${doneCount} of ${total} done` : state.phase === "done" ? "Batch complete" : state.phase === "preview" ? "File ready" : "Waiting for a file"}
        </span>
      </ConsoleNav>

      <main className="mx-auto grid max-w-[1360px] grid-cols-[minmax(0,1fr)] gap-6 px-5 pt-24 pb-24 md:px-8 lg:grid-cols-12">
        <div className="min-w-0 space-y-6 lg:col-span-4">
          <div>
            <h1 className="display text-4xl sm:text-5xl">Upload a file. Get the cases closed.</h1>
            <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-mute">
              Drop in a CSV, TSV or JSON export of failed and held settlements. The agents work through each one, fix what policy allows, escalate the rest with a plan, and learn as they go.
            </p>
          </div>

          <div className="glass glass-tint">
            <div className="px-5 pt-5">
              <label
                htmlFor="batch-file"
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  if (!running) void onFiles(event.dataTransfer.files);
                }}
                className={`flex cursor-pointer flex-col items-center gap-3 rounded-[2px] border border-dashed px-4 py-8 text-center transition-colors ${
                  dragging ? "border-lime bg-lime/10" : "border-line hover:border-lime/60"
                } ${running ? "pointer-events-none opacity-60" : ""}`}
              >
                <FileUp aria-hidden="true" className="size-6 text-lime" />
                <span className="label">{state.fileName ? state.fileName : "Drop a file here or choose one"}</span>
                <span className="text-[13px] text-mute">CSV, TSV or JSON, up to {Math.round(MAX_BYTES / 1000)} KB</span>
                <input id="batch-file" ref={picker} type="file" accept=".csv,.tsv,.txt,.json,text/csv,application/json" className="sr-only" disabled={running} onChange={(event) => void onFiles(event.target.files)} />
              </label>

              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <button
                  type="button"
                  disabled={running}
                  onClick={() => void loadSample()}
                  className="label rounded-[2px] border border-line px-3 py-2.5 transition-colors hover:border-lime hover:text-lime disabled:opacity-60"
                >
                  Use the sample file
                </button>
                <a href={SAMPLE_URL} download={SAMPLE_NAME} className="label flex items-center justify-center gap-2 rounded-[2px] border border-line px-3 py-2.5 transition-colors hover:border-lime hover:text-lime">
                  <Download aria-hidden="true" className="size-3.5" />
                  Download it
                </a>
              </div>
            </div>

            {state.phase === "error" && state.error && (
              <p role="alert" className="mx-5 mt-4 rounded-[2px] border border-ember/60 px-3.5 py-3 font-mono text-[12.5px] leading-snug text-ember">
                {state.error}
              </p>
            )}

            <div className="space-y-4 px-5 pt-5">
              <Toggle
                checked={options.freshMemory}
                onChange={(freshMemory) => setOptions((o) => ({ ...o, freshMemory }))}
                title="Start from empty memory"
                detail="Watch the agents learn from your file. Your saved memory is left untouched."
              />
              <Toggle
                checked={options.chaos}
                onChange={(chaos) => setOptions((o) => ({ ...o, chaos }))}
                title="Break something"
                detail="The first call to an external system fails in every case. Each one recovers from its own checkpoint."
              />
              <Toggle
                checked={options.llm && llm.ready === true}
                onChange={(value) => setOptions((o) => ({ ...o, llm: value }))}
                disabled={llm.ready !== true}
                title={`Write subject lines with ${llm.model}`}
                detail={llm.ready === true ? "Adds a few seconds to every case. Decisions are unaffected." : llm.ready === null ? "Checking for a local model..." : "No local model found, so built-in subject lines are used."}
              />
            </div>

            <div className="px-5 py-5">
              <button
                type="button"
                disabled={!canRun || running}
                onClick={() => state.text && void run(state.fileName ?? "upload.csv", state.text, options)}
                className="label flex w-full items-center justify-between gap-4 rounded-[2px] border border-lime bg-lime px-5 py-4 text-void transition-colors duration-200 hover:border-ink hover:bg-ink disabled:cursor-not-allowed disabled:opacity-60"
              >
                {running
                  ? `Working through ${total} cases`
                  : state.phase === "done"
                    ? state.text
                      ? "Run it again"
                      : "Choose a file to run another"
                    : total > 0
                      ? `Process ${total} case${total === 1 ? "" : "s"}`
                      : "Choose a file first"}
                {running ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Play aria-hidden="true" className="size-4" />}
              </button>
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-6 lg:col-span-8">
          {state.phase === "idle" && (
            <div className="glass glass-tint space-y-5 px-5 py-6 md:px-8">
              <h2 className="display text-2xl sm:text-3xl">What happens to your file</h2>
              <ol className="space-y-3 text-[15px] leading-relaxed">
                <li>
                  <span className="label mr-3 text-lime">1</span>Rows marked failed or held become cases. Settled rows are kept as history, and the agents use them to find the right IFSC for an account.
                </li>
                <li>
                  <span className="label mr-3 text-lime">2</span>Each case goes through the same four agents as the single-case console, with its own trace, checkpoints and cost.
                </li>
                <li>
                  <span className="label mr-3 text-lime">3</span>If the file does not hold the evidence for a fix, the agents say what is missing and escalate. They never guess.
                </li>
                <li>
                  <span className="label mr-3 text-lime">4</span>You get a table of outcomes, an escalation list with the next step for a person, and CSV downloads of both.
                </li>
              </ol>
              <details>
                <summary className="label cursor-pointer text-mute hover:text-ink">Which columns can the file have?</summary>
                <dl className="mt-3 divide-y divide-line">
                  {columnHelp.map(([name, note]) => (
                    <div key={name} className="grid gap-x-4 gap-y-1 py-2 sm:grid-cols-[17rem_1fr]">
                      <dt className="font-mono text-[12.5px]">{name}</dt>
                      <dd className="text-[13px] text-mute">{note}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-[13px] text-mute">Column names are matched loosely, so txn, transaction_id and Settlement ID all work. Anything else is ignored.</p>
              </details>
            </div>
          )}

          {state.phase === "preview" && state.report && <IntakePreview report={state.report} />}

          {(state.phase === "running" || state.phase === "done") && state.report && (
            <>
              {state.summary ? (
                <SummaryCards summary={state.summary} total={total} />
              ) : (
                <div className="glass glass-tint px-5 py-4" role="status">
                  <p className="label flex items-center justify-between gap-4">
                    <span>
                      {doneCount} of {total} cases done
                    </span>
                    <span className="text-mute">{state.results.filter((r) => r.outcome === "resolved").length} resolved so far</span>
                  </p>
                  <div className="mt-3 h-1.5 bg-white/10" aria-hidden="true">
                    <div className="h-full bg-lime transition-[width] duration-500" style={{ width: `${(doneCount / Math.max(total, 1)) * 100}%` }} />
                  </div>
                </div>
              )}

              {state.phase === "done" && (
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={downloadResults} className="label flex items-center gap-2 rounded-[2px] border border-line px-3 py-2.5 transition-colors hover:border-lime hover:text-lime">
                    <Download aria-hidden="true" className="size-3.5" />
                    Download all results
                  </button>
                  {waitingCount > 0 && (
                    <button type="button" onClick={downloadEscalations} className="label flex items-center gap-2 rounded-[2px] border border-line px-3 py-2.5 transition-colors hover:border-teal hover:text-teal">
                      <Download aria-hidden="true" className="size-3.5" />
                      Download the {waitingCount} escalations
                    </button>
                  )}

                </div>
              )}

              <ResultsTable cases={cases} results={state.results} current={state.current} />
            </>
          )}
        </div>
      </main>
    </>
  );
}
