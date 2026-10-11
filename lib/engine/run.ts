import { close, decide, investigate, resolve, startDraft } from "@/lib/engine/agents";
import { ollamaStatus, warmIfStale } from "@/lib/engine/ollama";
import { RunContext } from "@/lib/engine/runtime";
import { store } from "@/lib/engine/store";
import { telemetryOn, traced } from "@/lib/engine/telemetry";
import * as tools from "@/lib/engine/tools";
import type { Outcome, RunEvent, RunOptions, RunReport, RunResult, Span, StoredRun } from "@/lib/engine/types";

// Runs one case end to end and streams every event to `sink`. Never throws: a failure becomes a result.
export async function executeRun(options: RunOptions, sink: (event: RunEvent) => void): Promise<StoredRun> {
  const status = await ollamaStatus();
  const llmOn = (options.llm ?? true) && status.available;
  if (llmOn) warmIfStale();
  // The emitter needs the run id, and the run needs the emitter, so it reads `ctx` lazily.
  const emit = (event: RunEvent) => {
    store.append(ctx.id, event);
    try {
      sink(event);
    } catch {
      // The client may have gone away. The run still finishes and is stored.
    }
  };
  const ctx: RunContext = new RunContext(options.speed ?? 1, options.chaos ?? false, llmOn, emit, options.world, { ambiguous: options.ambiguous ?? false, unsafeRetry: options.unsafeRetry ?? false });
  const meta = {
    id: ctx.id,
    traceId: ctx.traceId,
    instruction: options.instruction,
    chaos: options.chaos ?? false,
    startedAt: new Date(ctx.t0).toISOString(),
    llm: { ...status, enabled: llmOn },
  };
  const stored = store.start(meta);
  emit({ type: "run.start", run: meta });
  ctx.pushCost();

  // One neatlogs WORKFLOW per case. Every agent, tool call and model call nests under it, so a case is one trace.
  const outcome = await traced(
    {
      name: "resolve-merchant-case",
      kind: "WORKFLOW",
      input: options.instruction,
      attributes: { "resolver.run_id": ctx.id, "resolver.chaos": meta.chaos, "resolver.llm": llmOn },
    },
    async (span) => {
      let result: RunResult;
      let txn: string | null = null;
      let pattern: string | null = null;
      try {
        const out = await coordinate(ctx, options.instruction, options.txn);
        result = out.result;
        txn = out.txn;
        pattern = out.pattern;
      } catch (error) {
        ctx.log("coordinator", "error", `Run failed: ${error instanceof Error ? error.message : "unknown error"}`);
        ctx.agent("coordinator", "error");
        result = finish(ctx, "failed", "The run stopped on an unexpected error.", false, null, null);
      }
      // Set explicitly so the trace shows the outcome, not the whole report object.
      span.setAttribute("output.value", JSON.stringify({ outcome: result.outcome, summary: result.summary }));
      span.setAttribute("resolver.outcome", result.outcome);
      return { result, txn, pattern, traceId: span.spanContext().traceId };
    },
  );
  const { result, txn, pattern } = outcome;

  emit({ type: "run.end", result });
  emit({ type: "export", neatlogs: telemetryOn() ? { status: "traced", traceId: outcome.traceId || undefined } : { status: "disabled" } });
  store.finish(ctx.id, {
    id: ctx.id,
    instruction: options.instruction,
    startedAt: meta.startedAt,
    txn,
    pattern,
    outcome: result.outcome,
    chaos: meta.chaos,
    memoryHit: result.memoryHit,
    durationMs: result.durationMs,
    toolCalls: result.cost.toolCalls,
    llmCalls: result.cost.llmCalls,
    costUsd: result.cost.totalUsd,
  });
  return stored;
}

function finish(ctx: RunContext, outcome: Outcome, summary: string, memoryHit: boolean, pattern: string | null, report: RunReport | null): RunResult {
  const durationMs = ctx.now();
  // Compute time is the one cost that depends on how long the run took.
  const computeUsd = (durationMs / 1000) * 0.00002;
  ctx.cost.infraUsd += computeUsd;
  ctx.pushCost();
  return {
    outcome,
    summary,
    durationMs,
    memoryHit,
    pattern,
    spanCount: ctx.spans.size,
    checkpointCount: ctx.chain.items.length,
    chainValid: ctx.chain.verify(),
    cost: { ...ctx.cost, totalUsd: ctx.cost.llmUsd + ctx.cost.infraUsd },
    report,
  };
}

async function coordinate(ctx: RunContext, instruction: string, forcedTxn?: string): Promise<{ result: RunResult; txn: string | null; pattern: string | null }> {
  return ctx.asAgent("coordinator", "coordinator.run", null, async (root: Span) => {
    const c = { ctx, agent: "coordinator" as const, parent: root };
    ctx.status("Case received", "fault", 0);
    ctx.emit({ type: "case", patch: { humanInput: "One instruction" } });
    ctx.log("coordinator", "info", `Instruction received: "${instruction}"`);

    const txn = forcedTxn ?? instruction.match(/\b(\d{4,6})\b/)?.[1] ?? null;
    if (!txn) {
      ctx.log("coordinator", "warn", "No transaction id in the instruction. Asking the operator for one.");
      ctx.status("Needs a transaction id", "fault", 0);
      return { result: finish(ctx, "needs_info", "Include a transaction id such as #48213 so the case can be found.", false, null, null), txn, pattern: null };
    }

    let s;
    try {
      s = await tools.getSettlement(c, txn);
    } catch {
      ctx.log("coordinator", "warn", `No settlement found for txn ${txn}. Nothing was changed.`);
      ctx.status("Case not found", "fault", 0);
      return { result: finish(ctx, "not_found", `No settlement exists for txn ${txn}. Nothing was changed.`, false, null, null), txn, pattern: null };
    }

    const merchant = ctx.world.merchants[s.merchantId];
    ctx.emit({ type: "case", patch: { txn, merchant: merchant.name, fault: s.status === "FAILED" ? "Settlement failed" : "Settlement held" } });
    ctx.status(s.status === "FAILED" ? "Settlement failed" : "Settlement held", "fault", 0);
    ctx.log("coordinator", "info", `Case: ${s.failureMessage}`);

    // The plan is deterministic code, not model output.
    ctx.log("coordinator", "info", "Plan: Investigation finds the cause, Resolution applies only what policy allows and verifies it against the real system, Closure documents and informs the merchant.");
    ctx.checkpoint("coordinator", "plan", { txn, pattern: s.failureCode, workers: ["investigation", "resolution", "closure"] }, root);
    ctx.status("Planning", "work", 0.2);

    ctx.agent("coordinator", "waiting");
    const diag = await investigate(ctx, root, s);
    ctx.agent("coordinator", "active");
    ctx.status("Root cause found", "work", 0.4);
    ctx.emit({ type: "case", patch: { rootCause: diag.rootCause } });

    const decision = await decide(ctx, root, s, diag);
    ctx.log("coordinator", "info", `Decision: ${decision.action}. ${decision.rationale}`);

    // The local model writes the email subject line while Resolution works. It can be slow on a laptop, so it overlaps.
    const draft = startDraft(ctx, root, s, decision, diag);

    ctx.agent("coordinator", "waiting");
    const res = await resolve(ctx, root, s, decision);
    const report = await close(ctx, root, s, diag, decision, res, draft);
    ctx.agent("coordinator", "active");

    // Explanations that are still being written must land in the trace before the run ends.
    await Promise.allSettled(ctx.pending);

    const seconds = (ctx.now() / 1000).toFixed(1);
    const summary =
      res.outcome === "resolved"
        ? `Settlement ${txn} verified as settled in ${seconds} s.`
        : res.outcome === "escalated"
          ? `Handled safely in ${seconds} s. A human decision is still needed.`
          : `Could not complete the fix. ${res.verification}.`;
    return { result: finish(ctx, res.outcome, summary, diag.memoryHit, s.failureCode, report), txn, pattern: s.failureCode };
  });
}
