import type { IntakeReport } from "@/lib/engine/intake";
import type { BatchCaseResult, BatchEvent, BatchOptions, BatchSummary, StoredBatch } from "@/lib/engine/types";

export type BatchState = {
  phase: "idle" | "preview" | "running" | "done" | "error";
  fileName: string | null;
  text: string | null;
  report: IntakeReport | null;
  batchId: string | null;
  options: BatchOptions | null;
  results: BatchCaseResult[];
  current: number | null;
  summary: BatchSummary | null;
  error: string | null;
};

export const initialBatchState: BatchState = {
  phase: "idle",
  fileName: null,
  text: null,
  report: null,
  batchId: null,
  options: null,
  results: [],
  current: null,
  summary: null,
  error: null,
};

export type BatchAction =
  | { type: "file"; fileName: string; text: string; report: IntakeReport }
  | { type: "error"; message: string; fileName?: string | null }
  | { type: "start" }
  | { type: "event"; event: BatchEvent }
  | { type: "load"; batch: StoredBatch };

export function batchReducer(state: BatchState, action: BatchAction): BatchState {
  switch (action.type) {
    case "file":
      return { ...initialBatchState, phase: "preview", fileName: action.fileName, text: action.text, report: action.report };
    case "error":
      return { ...state, phase: "error", error: action.message, fileName: action.fileName ?? state.fileName, report: null };
    case "start":
      return { ...state, phase: "running", results: [], summary: null, current: null, batchId: null, error: null };
    case "load":
      return {
        ...initialBatchState,
        phase: "done",
        fileName: action.batch.report.filename,
        report: action.batch.report,
        batchId: action.batch.id,
        options: action.batch.options,
        results: action.batch.results,
        summary: action.batch.summary,
      };
    case "event": {
      const event = action.event;
      if (event.type === "batch.start") return { ...state, phase: "running", batchId: event.id, report: event.report, options: event.options };
      if (event.type === "case.start") return { ...state, current: event.index };
      if (event.type === "case.end") return { ...state, current: null, results: [...state.results, event.result] };
      return { ...state, phase: "done", current: null, summary: event.summary };
    }
  }
}
