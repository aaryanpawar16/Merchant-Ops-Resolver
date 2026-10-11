import type { Tone } from "@/lib/caseStatus";
import type { AgentId, AgentState, CaseRecord, Checkpoint, Cost, LogLevel, NeatlogsExport, RunEvent, RunMeta, RunResult, Span } from "@/lib/engine/types";

export type LogLine = { atMs: number; agent: AgentId; level: LogLevel; text: string };

export type RunState = {
  phase: "idle" | "running" | "done" | "error";
  meta: RunMeta | null;
  agents: Record<AgentId, AgentState>;
  spans: Span[];
  logs: LogLine[];
  checkpoints: Checkpoint[];
  status: { status: string; tone: Tone; repair: number };
  record: CaseRecord;
  cost: Cost;
  result: RunResult | null;
  neatlogs: NeatlogsExport | null;
  error: string | null;
};

export const emptyRecord: CaseRecord = {
  txn: "",
  merchant: "",
  fault: "",
  rootCause: "",
  fix: "",
  verification: "",
  humanInput: "",
};

const emptyCost: Cost = { llmUsd: 0, infraUsd: 0, totalUsd: 0, tokensIn: 0, tokensOut: 0, llmCalls: 0, toolCalls: 0 };

export const initialState: RunState = {
  phase: "idle",
  meta: null,
  agents: { coordinator: "idle", investigation: "idle", resolution: "idle", closure: "idle" },
  spans: [],
  logs: [],
  checkpoints: [],
  status: { status: "Waiting for a case", tone: "fault", repair: 0 },
  record: emptyRecord,
  cost: emptyCost,
  result: null,
  neatlogs: null,
  error: null,
};

export type Action =
  | { type: "reset" }
  | { type: "event"; event: RunEvent }
  | { type: "load"; events: RunEvent[] }
  | { type: "error"; message: string };

export function reducer(state: RunState, action: Action): RunState {
  if (action.type === "reset") return { ...initialState, phase: "running" };
  if (action.type === "error") return { ...state, phase: "error", error: action.message };
  if (action.type === "load") return action.events.reduce((acc, event) => reducer(acc, { type: "event", event }), initialState);

  const event = action.event;
  switch (event.type) {
    case "run.start":
      return { ...state, phase: "running", meta: event.run };
    case "agent":
      return { ...state, agents: { ...state.agents, [event.agent]: event.state } };
    case "span.start":
      return { ...state, spans: [...state.spans, event.span] };
    case "span.end":
      return { ...state, spans: state.spans.map((s) => (s.id === event.span.id ? event.span : s)) };
    case "log":
      return { ...state, logs: [...state.logs, { atMs: event.atMs, agent: event.agent, level: event.level, text: event.text }] };
    case "checkpoint":
      return { ...state, checkpoints: [...state.checkpoints, event.checkpoint] };
    case "status":
      return { ...state, status: { status: event.status, tone: event.tone, repair: event.repair } };
    case "case":
      return { ...state, record: { ...state.record, ...event.patch } };
    case "cost":
      return { ...state, cost: event.cost };
    case "run.end":
      return { ...state, phase: "done", result: event.result, cost: event.result.cost };
    case "export":
      return { ...state, neatlogs: event.neatlogs };
  }
}
