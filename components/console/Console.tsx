"use client";

import { useEffect, useRef, useState } from "react";
import { AgentGraph } from "@/components/console/AgentGraph";
import { CaseRecordCard } from "@/components/console/CaseRecordCard";
import { CheckpointPanel } from "@/components/console/CheckpointPanel";
import { ConsoleNav } from "@/components/console/ConsoleNav";
import { InstructionPanel } from "@/components/console/InstructionPanel";
import { LogPanel } from "@/components/console/LogPanel";
import { MemoryPanel } from "@/components/console/MemoryPanel";
import { MoneyPanel } from "@/components/console/MoneyPanel";
import { ResultCard } from "@/components/console/ResultCard";
import { TracePanel } from "@/components/console/TracePanel";
import { useRunner } from "@/components/console/useRunner";
import { Backdrop } from "@/components/ui/Backdrop";
import { setCase } from "@/lib/caseStatus";
import { PRESETS } from "@/lib/engine/world";

type TabId = "log" | "trace" | "checkpoints" | "money" | "memory";

const tabs: { id: TabId; label: string; hint: string }[] = [
  { id: "log", label: "Run log", hint: "what the agents say and do" },
  { id: "trace", label: "Trace", hint: "neatlogs-style waterfall" },
  { id: "checkpoints", label: "Checkpoints", hint: "hash-linked, resumable" },
  { id: "money", label: "Economics", hint: "cfo.ai-style unit costs" },
  { id: "memory", label: "Memory", hint: "what the team has learned" },
];

// The guided run: one click plays the break-and-recover case, then steps through what it left behind.
const tourSteps: { tab: TabId; caption: string }[] = [
  { tab: "log", caption: "The agents investigate, hit a failed bank call, and recover from a checkpoint." },
  { tab: "trace", caption: "Every agent, tool and model call is a span you can open." },
  { tab: "checkpoints", caption: "Each step is saved and hash-linked. The retry resumed from the marked checkpoint, not from the start." },
  { tab: "money", caption: "The whole case cost under a cent. Done by hand it takes about 38 minutes." },
];

export function Console() {
  const { state, start, load } = useRunner();
  const [instruction, setInstruction] = useState<string>(PRESETS[0].instruction);
  const [chaos, setChaos] = useState(false);
  const [llm, setLlm] = useState(true);
  const [llmInfo, setLlmInfo] = useState<{ available: boolean; model: string } | null>(null);
  const [tab, setTab] = useState<TabId>("log");
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);

  const running = state.phase === "running";
  const done = state.phase === "done";
  const runId = state.meta?.id ?? null;
  const refreshKey = done && runId ? runId : "";
  // During the guided run the tour picks the tab. Any click on a tab ends the tour.
  const shownTab: TabId = tourStep !== null ? tourSteps[tourStep].tab : tab;

  // The backdrop and accent colour follow the case, as on the landing page.
  useEffect(() => {
    setCase("Waiting for a case", "fault", 0);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/status", { cache: "no-store" })
      .then((res) => res.json())
      .then((body: { available: boolean; model: string }) => !cancelled && setLlmInfo({ available: body.available, model: body.model }))
      .catch(() => !cancelled && setLlmInfo({ available: false, model: "llama2" }));
    return () => {
      cancelled = true;
    };
  }, []);

  // Open a shared run link such as /console?run=run_ab12cd34.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("run");
    if (id) void load(id);
  }, [load]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setElapsed(performance.now() - startedAt.current), 100);
    return () => clearInterval(timer);
  }, [running]);

  // Advance the guided run: wait for the case to finish, then give each view a few seconds.
  useEffect(() => {
    if (tourStep === null) return;
    if (tourStep === 0 && state.phase === "error") {
      const id = setTimeout(() => setTourStep(null), 0);
      return () => clearTimeout(id);
    }
    if (tourStep === 0 && !done) return;
    const last = tourStep >= tourSteps.length - 1;
    const id = setTimeout(
      () => {
        if (last) {
          setTab(tourSteps[tourStep].tab);
          setTourStep(null);
        } else {
          setTourStep(tourStep + 1);
        }
      },
      tourStep === 0 ? 1500 : 5000,
    );
    return () => clearTimeout(id);
  }, [tourStep, done, state.phase]);

  function run() {
    setTourStep(null);
    startedAt.current = performance.now();
    setElapsed(0);
    setTab("log");
    void start({ instruction: instruction.trim(), chaos, llm: llm && llmInfo?.available === true });
  }

  function startTour() {
    const preset = PRESETS[0].instruction;
    setInstruction(preset);
    setChaos(true);
    startedAt.current = performance.now();
    setElapsed(0);
    setTab("log");
    setTourStep(0);
    void start({ instruction: preset, chaos: true, llm: llm && llmInfo?.available === true });
  }

  function selectTab(id: TabId) {
    setTourStep(null);
    setTab(id);
  }

  // Arrow keys, Home and End move between tabs, as the tabs pattern expects.
  function onTabKeyDown(event: React.KeyboardEvent) {
    const index = tabs.findIndex((t) => t.id === shownTab);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    selectTab(tabs[next].id);
    document.getElementById(`tab-${tabs[next].id}`)?.focus();
  }

  const shownElapsed = done && state.result ? state.result.durationMs : elapsed;
  const memoryNote = state.result?.pattern
    ? state.result.memoryHit
      ? "Memory hit. This case started from a saved playbook, so it skipped the full sweep."
      : "Cold start. No playbook existed for this failure, so the agents swept every system. It is saved now: run this case again and compare."
    : null;

  return (
    <>
      <Backdrop />

      <ConsoleNav active="single">
        <span className="text-mute">{(shownElapsed / 1000).toFixed(1)}s</span>
        <span role="status" className="tone flex items-center gap-2 rounded-[2px] border border-current px-2.5 py-1.5">
          <span aria-hidden="true" className={`bg-tone size-1.5 ${running ? "animate-blink" : ""}`} />
          {state.status.status}
        </span>
      </ConsoleNav>

      <main className="mx-auto grid max-w-[1360px] grid-cols-[minmax(0,1fr)] gap-6 px-5 pt-24 pb-24 md:px-8 lg:grid-cols-12">
        <div className="min-w-0 space-y-6 lg:col-span-4">
          <div>
            <h1 className="display text-4xl sm:text-5xl">Give it one instruction.</h1>
            <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-mute">
              Four agents investigate, fix within policy, verify against the real system, and close the case. Every step is traced, checkpointed and priced.
            </p>
          </div>

          <InstructionPanel
            instruction={instruction}
            onInstruction={setInstruction}
            chaos={chaos}
            onChaos={setChaos}
            llm={llm}
            onLlm={setLlm}
            llmReady={llmInfo ? llmInfo.available : null}
            model={llmInfo?.model ?? "llama2"}
            running={running}
            onRun={run}
            onTour={startTour}
          />

          {state.phase === "error" && (
            <p role="alert" className="rounded-[2px] border border-ember/60 px-4 py-3 font-mono text-[12.5px] text-ember">
              {state.error}
            </p>
          )}

          <CaseRecordCard record={state.record} status={state.status.status} tone={state.status.tone} live={running} />
        </div>

        <div className="min-w-0 space-y-6 lg:col-span-8">
          {tourStep !== null && (
            <div role="status" className="glass glass-tint label flex items-center justify-between gap-4 !border-lime/60 px-5 py-3.5">
              <span>
                <span className="text-lime">Guided run, step {tourStep + 1} of {tourSteps.length}.</span>{" "}
                <span className="normal-case tracking-normal">{tourSteps[tourStep].caption}</span>
              </span>
              <button type="button" onClick={() => setTourStep(null)} className="shrink-0 rounded-[2px] border border-line px-2.5 py-1.5 transition-colors hover:border-lime hover:text-lime">
                Stop
              </button>
            </div>
          )}

          <section aria-label="Agent graph" className="glass glass-tint px-4 py-5 md:px-8">
            <AgentGraph agents={state.agents} />
          </section>

          {state.result && <ResultCard result={state.result} runId={runId} memoryNote={memoryNote} model={state.meta?.llm.model ?? llmInfo?.model ?? "the model"} />}

          <section aria-label="Run details" className="glass glass-tint overflow-hidden">
            <div role="tablist" aria-label="Run details" onKeyDown={onTabKeyDown} className="label flex overflow-x-auto border-b border-line">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  type="button"
                  id={`tab-${t.id}`}
                  aria-selected={shownTab === t.id}
                  aria-controls={`panel-${t.id}`}
                  tabIndex={shownTab === t.id ? 0 : -1}
                  onClick={() => selectTab(t.id)}
                  title={t.hint}
                  className={`whitespace-nowrap border-b px-4 py-3.5 transition-colors ${
                    shownTab === t.id ? "border-lime text-lime" : "border-transparent text-mute hover:text-ink"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div role="tabpanel" id={`panel-${shownTab}`} aria-labelledby={`tab-${shownTab}`}>
              {shownTab === "log" && <LogPanel logs={state.logs} running={running} />}
              {shownTab === "trace" && <TracePanel spans={state.spans} elapsedMs={shownElapsed} runId={runId} done={done} neatlogs={state.neatlogs} />}
              {shownTab === "checkpoints" && <CheckpointPanel checkpoints={state.checkpoints} logs={state.logs} chainValid={state.result ? state.result.chainValid : null} />}
              {shownTab === "money" && <MoneyPanel cost={state.cost} result={state.result} refreshKey={refreshKey} />}
              {shownTab === "memory" && <MemoryPanel refreshKey={refreshKey} patternInRun={state.result?.pattern ?? null} />}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
