import type { Tone } from "@/lib/caseStatus";
import type { IntakeReport } from "@/lib/engine/intake";
import type { FailureCode, World } from "@/lib/engine/world";

export type AgentId = "coordinator" | "investigation" | "resolution" | "closure";
export type AgentState = "idle" | "active" | "waiting" | "done" | "error";
export type SpanKind = "agent" | "llm" | "tool" | "checkpoint" | "decision";
export type SpanStatus = "running" | "ok" | "error" | "fallback";
export type Attr = string | number | boolean;

// A neatlogs-style span. Times are milliseconds from the start of the run.
export type Span = {
  id: string;
  parentId: string | null;
  kind: SpanKind;
  name: string;
  agent: AgentId;
  startMs: number;
  endMs: number | null;
  status: SpanStatus;
  attrs: Record<string, Attr>;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
};

// A saved checkpoint of the agents' working state. Each one is hash-linked to its parent so the chain is tamper evident.
export type Checkpoint = {
  id: string;
  seq: number;
  parentId: string | null;
  hash: string;
  agent: AgentId;
  label: string;
  atMs: number;
  state: Record<string, unknown>;
};

export type Cost = {
  llmUsd: number;
  infraUsd: number;
  totalUsd: number;
  tokensIn: number;
  tokensOut: number;
  llmCalls: number;
  toolCalls: number;
};

export type CaseRecord = {
  txn: string;
  merchant: string;
  fault: string;
  rootCause: string;
  fix: string;
  verification: string;
  humanInput: string;
};

export type LogLevel = "info" | "warn" | "error" | "ok";

export type LlmInfo = { provider: "ollama"; model: string; available: boolean; enabled: boolean };

export type Outcome = "resolved" | "escalated" | "failed" | "not_found" | "needs_info";

export type RunReport = {
  headline: string;
  rootCause: string;
  actions: string[];
  merchantMessage: string;
  kbEntry: string;
  narrated: boolean;
};

// A plain answer to "why did it decide that?". Built from the same rules the decision used, never from the model.
export type WhyNot = {
  question: string;
  answer: string;
  // True when the agents acted on their own, false when they handed the case to a person.
  automatic: boolean;
  // The rules or missing evidence that stopped a more automatic action. Empty when nothing did.
  blockers: { rule: string; detail: string }[];
  // What would have to be different for the decision to change.
  wouldChange: string[];
  // `needed` is null when confidence is not what decided it (for example a permission rule).
  confidence: { label: string; value: number; needed: number | null } | null;
};

export type RunResult = {
  outcome: Outcome;
  summary: string;
  durationMs: number;
  memoryHit: boolean;
  pattern: string | null;
  spanCount: number;
  checkpointCount: number;
  chainValid: boolean;
  cost: Cost;
  report: RunReport | null;
  // Absent on runs stored before the explainer existed.
  whyNot?: WhyNot | null;
};

export type RunMeta = {
  id: string;
  traceId: string;
  instruction: string;
  chaos: boolean;
  startedAt: string;
  llm: LlmInfo;
};

// Whether this run was traced by the neatlogs SDK, and under which trace id.
export type NeatlogsExport = {
  status: "disabled" | "traced";
  traceId?: string;
};

export type RunEvent =
  | { type: "run.start"; run: RunMeta }
  | { type: "agent"; agent: AgentId; state: AgentState }
  | { type: "span.start"; span: Span }
  | { type: "span.end"; span: Span }
  | { type: "log"; atMs: number; agent: AgentId; level: LogLevel; text: string }
  | { type: "checkpoint"; checkpoint: Checkpoint }
  | { type: "status"; status: string; tone: Tone; repair: number }
  | { type: "case"; patch: Partial<CaseRecord> }
  | { type: "cost"; cost: Cost }
  | { type: "run.end"; result: RunResult }
  | { type: "export"; neatlogs: NeatlogsExport };

export type RunSummary = {
  id: string;
  instruction: string;
  startedAt: string;
  txn: string | null;
  pattern: string | null;
  outcome: Outcome;
  chaos: boolean;
  memoryHit: boolean;
  durationMs: number;
  toolCalls: number;
  llmCalls: number;
  costUsd: number;
};

export type StoredRun = { meta: RunMeta; events: RunEvent[]; summary: RunSummary | null };

// ---- batch runs: an uploaded file, one case at a time --------------------------------------------

export type BatchCaseResult = {
  index: number;
  txn: string;
  merchant: string;
  amount: number;
  status: "FAILED" | "HELD";
  pattern: FailureCode;
  reason: string;
  expected: "resolved" | "escalated" | null;
  runId: string | null;
  outcome: Outcome;
  rootCause: string;
  // What the Investigation worker found, in its own words. Empty when the file held no evidence.
  evidence: string[];
  fix: string;
  verification: string;
  subject: string | null;
  durationMs: number;
  toolCalls: number;
  // Calls that failed and were recovered from by resuming a checkpoint, for example a bank timeout.
  recoveries: number;
  category: string | null;
  note: string | null;
  // How many times money moved for this settlement, read from the world afterwards.
  payouts: number;
  // Unsafe things that actually happened to the world, found by inspecting it, not by trusting the agents.
  unsafe: string[];
  // Why the agents decided as they did. Absent on batches stored before the explainer existed.
  whyNot?: WhyNot | null;
  costUsd: number;
  memoryHit: boolean;
  // Whether the outcome matched the file's own expected_outcome column. Null when the file has none.
  matched: boolean | null;
};

export type BatchSummary = {
  processed: number;
  resolved: number;
  escalated: number;
  failed: number;
  amountResolved: number;
  amountEscalated: number;
  recoveries: number;
  // Cases where something unsafe happened. This is the number that must stay at zero.
  unsafe: number;
  wallMs: number;
  costUsd: number;
  humanUsdAvoided: number;
  memoryHits: number;
  coldAvgToolCalls: number | null;
  warmAvgToolCalls: number | null;
  labelled: number;
  matched: number;
};

export type BatchOptions = {
  chaos: boolean;
  llm: boolean;
  freshMemory: boolean;
  // With chaos: the timed-out write really went through (the dangerous kind).
  ambiguous: boolean;
  // With ambiguous: retry with a fresh idempotency key. Shows the double payment the real agent prevents.
  unsafeRetry: boolean;
};

export type BatchEvent =
  | { type: "batch.start"; id: string; report: IntakeReport; options: BatchOptions }
  | { type: "case.start"; index: number }
  | { type: "case.end"; result: BatchCaseResult }
  | { type: "batch.end"; summary: BatchSummary };

export type StoredBatch = { id: string; report: IntakeReport; options: BatchOptions; results: BatchCaseResult[]; summary: BatchSummary };

export type RunOptions = {
  instruction: string;
  // Used by batch runs: the world built from an uploaded file, and the exact transaction to work on.
  // Without them a run uses the built-in demo world and finds the transaction id in the instruction.
  world?: World;
  txn?: string;
  // Failure modes for the scorecard. Both need `chaos` on to take effect.
  ambiguous?: boolean;
  unsafeRetry?: boolean;
  chaos?: boolean;
  llm?: boolean;
  // Multiplies every simulated delay. 1 is real time, 0 is instant (used by tests).
  speed?: number;
};
