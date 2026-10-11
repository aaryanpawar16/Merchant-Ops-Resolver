import { memory } from "@/lib/engine/checkpoints";
import { MODEL, modelSpeed } from "@/lib/engine/ollama";

// Optional model text is skipped below this measured speed. llama2 here measured about 3 to 5 tokens per second.
const MIN_TPS_FOR_OPTIONAL_TEXT = 12;
import { RunContext, ToolTimeout } from "@/lib/engine/runtime";
import * as tools from "@/lib/engine/tools";
import { AUTO_RELEASE_LIMIT_INR } from "@/lib/engine/tools";
import type { Outcome, RunReport, Span } from "@/lib/engine/types";
import type { FailureCode, KycDoc, Merchant, RiskSignals, Settlement } from "@/lib/engine/world";

const SYSTEM = "You are part of an operations team inside a payments company. Answer in plain sentences. No lists, no markdown, no greetings.";

const inr = (n: number) => `INR ${n.toLocaleString("en-IN")}`;
const mask = (account: string) => `${"*".repeat(Math.max(account.length - 4, 0))}${account.slice(-4)}`;

// ---- diagnosis ---------------------------------------------------------------------------------

type Evidence = { tool: string; fact: string; weight: number };
export type Finding = { id: string; hypothesis: string; confidence: number; evidence: Evidence[] };
type Facts = {
  profile?: Merchant;
  kyc?: KycDoc[];
  risk?: RiskSignals | null;
  verify?: Awaited<ReturnType<typeof tools.verifyBeneficiary>>;
};
export type Diagnosis = {
  pattern: FailureCode;
  findings: Finding[];
  conflict: boolean;
  evidenceTools: string[];
  memoryHit: boolean;
  rootCause: string;
  facts: Facts;
};

// What a cold start sweeps: payments, KYC and risk data, in the order a human would open the dashboards.
const FULL_SWEEP: Record<FailureCode, string[]> = {
  IFSC_ACCOUNT_MISMATCH: ["get_merchant_profile", "get_kyc", "get_risk_signals", "lookup_ifsc", "verify_beneficiary"],
  KYC_DOCUMENT_EXPIRED: ["get_merchant_profile", "get_risk_signals", "get_kyc"],
  RISK_VELOCITY_SPIKE: ["get_merchant_profile", "get_kyc", "get_risk_signals"],
  // Nothing tells us where to look, so look everywhere. The agents will still not guess at a cause.
  UNCLASSIFIED: ["get_merchant_profile", "get_kyc", "get_risk_signals"],
};

function analyze(s: Settlement, facts: Facts): { findings: Finding[]; rootCause: string } {
  if (s.failureCode === "IFSC_ACCOUNT_MISMATCH") {
    const v = facts.verify;
    if (v?.accountFound && v.actualIfsc && !v.ifscOnFileMatches) {
      return {
        rootCause: "Bank IFSC code mismatch",
        findings: [
          {
            id: "ifsc_mismatch",
            hypothesis: `The IFSC on file (${s.beneficiary.ifsc}) is wrong. Account ${mask(s.beneficiary.account)} is held at ${v.actualBank} (${v.actualIfsc}).`,
            confidence: 0.97,
            evidence: [{ tool: "verify_beneficiary", fact: `penny drop: account sits at ${v.actualIfsc}, holder ${v.holder}`, weight: 0.97 }],
          },
        ],
      };
    }
  }

  if (s.failureCode === "KYC_DOCUMENT_EXPIRED") {
    const doc = facts.kyc?.find((d) => d.status === "EXPIRED");
    if (doc) {
      return {
        rootCause: "KYC document expired",
        findings: [
          {
            id: "kyc_expired",
            hypothesis: `${doc.type}${doc.id ? ` ${doc.id}` : ""} expired${doc.expires === "unknown" ? "" : ` on ${doc.expires}`}, so compliance froze the settlement.`,
            confidence: 0.99,
            evidence: [{ tool: "get_kyc", fact: `${doc.type} status EXPIRED${doc.expires === "unknown" ? "" : ` since ${doc.expires}`}`, weight: 0.99 }],
          },
        ],
      };
    }
  }

  if (s.failureCode === "RISK_VELOCITY_SPIKE" && facts.risk) {
    const r = facts.risk;
    const benign: Evidence[] = [];
    if (r.sameWeekLastYear >= 3) benign.push({ tool: "get_risk_signals", fact: `same week last year ran ${r.sameWeekLastYear}x baseline`, weight: 0.2 });
    if (r.repeatCustomerShare >= 0.9) benign.push({ tool: "get_risk_signals", fact: `${Math.round(r.repeatCustomerShare * 100)}% repeat customers`, weight: 0.15 });
    if (Math.abs(r.avgTicketVsBaseline - 1) <= 0.1) benign.push({ tool: "get_risk_signals", fact: "average ticket size is normal", weight: 0.1 });
    if (r.chargebackRate < 0.003) benign.push({ tool: "get_risk_signals", fact: `chargeback rate ${(r.chargebackRate * 100).toFixed(1)}%`, weight: 0.1 });
    const benignScore = Math.min(0.3 + benign.reduce((sum, e) => sum + e.weight, 0), 0.95);

    const findings: Finding[] = [
      {
        id: "seasonal_spike",
        // Worded by how strong the evidence is, so a weak explanation does not read like a verdict.
        hypothesis:
          benignScore >= 0.6
            ? `The ${r.volumeVsBaseline}x volume looks like genuine demand, not fraud (${benign.map((e) => e.fact).join("; ")}).`
            : benign.length > 0
              ? `Only weak signs that the ${r.volumeVsBaseline}x volume is genuine demand (${benign.map((e) => e.fact).join("; ")}).`
              : `Nothing supports the ${r.volumeVsBaseline}x volume as genuine demand.`,
        confidence: benignScore,
        evidence: benign,
      },
    ];
    const d = r.deviceCluster;
    if (d.sharedFingerprint && d.txns >= 10) {
      findings.push({
        id: "device_cluster",
        hypothesis: `${d.txns} payments in ${d.minutes} minutes share one device fingerprint (${inr(d.amount)}), which looks like card testing.`,
        confidence: 0.6 + (d.minutes <= 10 ? 0.1 : 0),
        evidence: [{ tool: "get_risk_signals", fact: `${d.txns} txns, ${d.minutes} min, one device fingerprint, ${inr(d.amount)}`, weight: 0.7 }],
      });
    }
    const ranked = [...findings].sort((a, b) => b.confidence - a.confidence);
    const rootCause =
      ranked.length > 1 && ranked[1].confidence > 0.5
        ? "Demand spike, plus one suspicious device cluster"
        : ranked[0].id === "device_cluster"
          ? "Suspicious device cluster, demand spike not supported"
          : "Demand spike with no sign of fraud";
    return { rootCause, findings };
  }

  // No finding means the evidence is missing or does not support a cause. Say so plainly.
  if (s.failureCode === "UNCLASSIFIED") return { rootCause: "Unrecognised failure reason", findings: [] };
  if (s.failureCode === "RISK_VELOCITY_SPIKE") return { rootCause: "No risk data supplied to judge the hold", findings: [] };
  if (s.failureCode === "IFSC_ACCOUNT_MISMATCH") return { rootCause: "Could not verify the correct IFSC from the data available", findings: [] };
  return { rootCause: "Could not confirm the cause from the data available", findings: [] };
}

export async function investigate(ctx: RunContext, parent: Span, s: Settlement): Promise<Diagnosis> {
  return ctx.asAgent("investigation", "investigation.run", parent, async (span) => {
    const c = { ctx, agent: "investigation" as const, parent: span };
    const facts: Facts = {};

    // The first thing a good teammate does is ask what the team already learned from similar cases.
    const mem = await tools.searchMemory(c, s.failureCode);
    const memoryHit = mem.hit;
    let plan: string[];
    if (mem.hit) {
      plan = mem.minimalTools;
      ctx.log("investigation", "ok", `Memory hit: ${mem.resolvedCases} similar cases resolved. Skipping the full sweep, running ${plan.length} targeted check${plan.length === 1 ? "" : "s"}.`);
    } else {
      plan = FULL_SWEEP[s.failureCode];
      ctx.log("investigation", "info", `No similar case on record. Sweeping payments, KYC and risk data (${plan.length} checks).`);
    }

    for (const name of plan) {
      if (name === "get_merchant_profile") facts.profile = await tools.getMerchantProfile(c, s.merchantId);
      else if (name === "get_kyc") facts.kyc = await tools.getKyc(c, s.merchantId);
      else if (name === "get_risk_signals") facts.risk = await tools.getRiskSignals(c, s.merchantId);
      else if (name === "lookup_ifsc") await tools.lookupIfsc(c, s.beneficiary.ifsc);
      else if (name === "verify_beneficiary") facts.verify = await tools.verifyBeneficiary(c, s.beneficiary.account, s.beneficiary.ifsc);
    }

    const { findings, rootCause } = analyze(s, facts);
    const best = [...findings].sort((a, b) => b.confidence - a.confidence);
    const conflict = best.length > 1 && best[1].confidence > 0.5;

    // Strongest first, so whoever reads the log or the evidence sees the finding that won before the ones that lost.
    for (const f of best) ctx.log("investigation", "info", `Finding (${Math.round(f.confidence * 100)}%): ${f.hypothesis}`);
    if (conflict) ctx.log("investigation", "warn", "Two findings point in opposite directions. Handing the conflict to the Coordinator.");

    const winners = conflict ? best : best.slice(0, 1);
    const evidenceTools = [...new Set(winners.flatMap((f) => f.evidence.map((e) => e.tool)))];
    ctx.checkpoint("investigation", "diagnosis", { txn: s.txn, pattern: s.failureCode, findings: best.map((f) => ({ id: f.id, confidence: f.confidence })), evidenceTools }, span);
    return { pattern: s.failureCode, findings: best, conflict, evidenceTools, memoryHit, rootCause, facts };
  });
}

// ---- decisions (Coordinator) -------------------------------------------------------------------

// The two numbers that decide whether a risk hold may be released without a person. Shared with the explainer,
// so what it tells a user is always what the rules actually are.
export const BENIGN_RELEASE_CONFIDENCE = 0.8;
export const MAX_RETAINED_SHARE = 0.1;

export type Decision =
  | { action: "correct_ifsc"; ifsc: string; rationale: string; arbitrated: false }
  | { action: "escalate_kyc"; rationale: string; arbitrated: false }
  | { action: "partial_release"; release: number; retain: number; rationale: string; arbitrated: boolean }
  | { action: "escalate_unknown"; rationale: string; arbitrated: false };

export async function decide(ctx: RunContext, parent: Span, s: Settlement, diag: Diagnosis): Promise<Decision> {
  const top = diag.findings[0];

  if (diag.conflict) {
    // The Coordinator settles disagreements with a stated rule, so the outcome is auditable.
    return ctx.decision<Decision>("coordinator", "coordinator.arbitrate", parent, { findings: diag.findings.map((f) => f.id).join(" vs ") }, async (span) => {
      ctx.agent("coordinator", "active");
      const cluster = diag.facts.risk?.deviceCluster;
      const exposure = cluster?.amount ?? 0;
      const share = exposure / s.amount;
      const release = s.amount - exposure;
      const safe = share < MAX_RETAINED_SHARE && release <= AUTO_RELEASE_LIMIT_INR;
      const rationale = safe
        ? `Both findings hold. The suspicious cluster is ${(share * 100).toFixed(1)}% of the settlement, so release ${inr(release)} and retain ${inr(exposure)} for human review.`
        : "The suspicious cluster is too large to release around, so the whole settlement stays held for human review.";
      ctx.log("coordinator", "warn", `Disagreement: ${diag.findings.map((f) => `${f.id} ${Math.round(f.confidence * 100)}%`).join(" vs ")}.`);
      ctx.log("coordinator", "ok", `Ruling: ${rationale}`);
      // The ruling is already stated above by code. The model's plain-English version is optional, so it is
      // only requested from a model measured fast enough not to hold up the run.
      if ((modelSpeed() ?? 0) >= MIN_TPS_FOR_OPTIONAL_TEXT) {
        void ctx.narrateInBackground(
          {
            agent: "coordinator",
            parent: span,
            name: "llm.explain_ruling",
            system: SYSTEM,
            prompt: `Two analysts disagree. One says: ${diag.findings[0].hypothesis} The other says: ${diag.findings[1].hypothesis} The coordinator ruled: ${rationale} Explain the ruling to a risk officer in one short sentence.`,
            fallback: rationale,
            maxTokens: 60,
            timeoutMs: 12_000,
          },
          (text, narrated) => narrated && ctx.log("coordinator", "info", `${MODEL} on the ruling: ${text}`),
        );
      }
      ctx.checkpoint("coordinator", "arbitration", { txn: s.txn, ruling: safe ? "partial_release" : "hold", exposure, release }, span);
      span.attrs.ruling = safe ? "partial_release" : "hold";
      span.attrs.exposureInr = exposure;
      ctx.status("Disagreement settled", "work", 0.5);
      if (safe) return { action: "partial_release", release, retain: exposure, rationale, arbitrated: true };
      return { action: "escalate_unknown", rationale, arbitrated: false };
    });
  }

  const verified = diag.facts.verify;
  if (s.failureCode === "IFSC_ACCOUNT_MISMATCH" && verified?.accountFound) {
    return { action: "correct_ifsc", ifsc: verified.actualIfsc, rationale: top.hypothesis, arbitrated: false };
  }
  if (s.failureCode === "KYC_DOCUMENT_EXPIRED" && top) {
    return { action: "escalate_kyc", rationale: top.hypothesis, arbitrated: false };
  }
  // A risk hold with only the benign explanation and nothing suspicious: release it, if policy allows.
  if (s.failureCode === "RISK_VELOCITY_SPIKE" && top?.id === "seasonal_spike" && top.confidence >= BENIGN_RELEASE_CONFIDENCE && s.amount <= AUTO_RELEASE_LIMIT_INR) {
    return { action: "partial_release", release: s.amount, retain: 0, rationale: top.hypothesis, arbitrated: false };
  }
  return { action: "escalate_unknown", rationale: "The evidence does not support a safe automatic fix.", arbitrated: false };
}

// ---- Resolution --------------------------------------------------------------------------------

type Strategy = { rail: "NEFT" | "IMPS"; channel: "email" | "sms"; idemKey: string; completed: string[]; attempt: number };
type Step = { id: string; run: (state: Strategy) => Promise<unknown> };

export type Resolved = {
  outcome: Outcome;
  verified: boolean;
  fix: string;
  verification: string;
  retries: number;
  skippedOnResume: number;
};

export async function resolve(ctx: RunContext, parent: Span, s: Settlement, decision: Decision): Promise<Resolved> {
  return ctx.asAgent("resolution", "resolution.run", parent, async (span) => {
    const c = { ctx, agent: "resolution" as const, parent: span };
    const state: Strategy = { rail: "NEFT", channel: "email", idemKey: `idem_${ctx.id}_${s.txn}`, completed: [], attempt: 0 };
    let retries = 0;
    let skippedOnResume = 0;

    const steps: Step[] = [];
    if (decision.action === "correct_ifsc") {
      steps.push(
        { id: "policy", run: () => tools.policyCheck(c, "update_bank_details") },
        { id: "update_ifsc", run: () => tools.updateBankIfsc(c, s.merchantId, decision.ifsc, s.txn) },
        { id: "retrigger", run: (st) => tools.retriggerSettlement(c, s.txn, st.rail, st.idemKey) },
      );
    } else if (decision.action === "partial_release") {
      steps.push(
        { id: "policy", run: () => tools.policyCheck(c, "release_hold", decision.release) },
        { id: "release", run: (st) => tools.releaseHold(c, s.txn, decision.release, decision.retain, st.idemKey) },
      );
    } else if (decision.action === "escalate_kyc") {
      steps.push(
        {
          id: "policy",
          run: async () => {
            const verdict = await tools.policyCheck(c, "modify_kyc_status");
            if (!verdict.allowed) ctx.log("resolution", "warn", `Policy blocks the direct fix: ${verdict.reason} Taking the safe path instead.`);
          },
        },
        { id: "request_rekyc", run: (st) => tools.requestRekyc(c, s.merchantId, st.channel) },
      );
    }
    // escalate_unknown has no steps: nothing is changed, the hold stays in place for a human.

    // Checkpoint before touching anything, so even the very first step can be resumed.
    ctx.checkpoint("resolution", "pre-fix", { txn: s.txn, action: decision.action, ...state }, span);

    for (;;) {
      try {
        for (const step of steps) {
          if (state.completed.includes(step.id)) continue;
          await step.run(state);
          state.completed.push(step.id);
          ctx.checkpoint("resolution", step.id, { txn: s.txn, action: decision.action, ...state }, span);
          if (step.id === "update_ifsc" || step.id === "release" || step.id === "request_rekyc") {
            ctx.status(step.id === "request_rekyc" ? "Safe action taken" : "Fix applied", "work", 0.7);
            ctx.emit({ type: "case", patch: { fix: fixText(decision) } });
          }
        }
        break;
      } catch (error) {
        if (!(error instanceof ToolTimeout) || state.attempt >= 2) throw error;
        retries += 1;
        state.attempt += 1;
        ctx.log("resolution", "error", error.message);
        ctx.agent("resolution", "waiting");

        // Resume from the last saved checkpoint instead of starting the case over.
        const last = ctx.chain.latest();
        if (last) {
          const saved = last.state as unknown as Strategy;
          state.completed = [...saved.completed];
          skippedOnResume = state.completed.filter((id) => id !== "policy").length;
          ctx.log("resolution", "ok", `Checkpoint: resumed from ${last.id} (${last.label}). ${state.completed.length} finished step${state.completed.length === 1 ? "" : "s"} will not repeat.`);
        }

        // Try a different approach rather than hammering the one that just failed.
        await ctx.decision("resolution", "resolution.retry_strategy", span, { attempt: state.attempt }, async (retry) => {
          let strategy = "retry with the same idempotency key";
          if (decision.action === "correct_ifsc") {
            state.rail = "IMPS";
            strategy = "switch rail NEFT to IMPS, same idempotency key so a double payout is impossible";
          } else if (decision.action === "escalate_kyc" || decision.action === "escalate_unknown") {
            state.channel = "sms";
            strategy = "switch channel email to SMS";
          }
          // The careless retry: a fresh key makes the bank treat the request as new, so it can pay twice.
          if (ctx.flags.unsafeRetry) {
            state.idemKey = `${state.idemKey}_retry${state.attempt}`;
            strategy = `${strategy} (UNSAFE: new idempotency key)`;
          }
          retry.attrs.strategy = strategy;
          ctx.log("resolution", "info", `Strategy: ${strategy}.`);
          await ctx.sleep(350 * state.attempt);
        });
        ctx.agent("resolution", "active");
      }
    }

    // With nothing to change, the record should still say what was decided.
    if (steps.length === 0) ctx.emit({ type: "case", patch: { fix: fixText(decision) } });

    // Verification. The case is never closed on the strength of a successful write alone.
    const { outcome, verification } = await ctx.decision<{ outcome: Outcome; verification: string }>(
      "resolution",
      "resolution.verify",
      span,
      {},
      async (verify) => {
        const vc = { ctx, agent: "resolution" as const, parent: verify };
        let latest = await tools.pollSettlement(vc, s.txn);
        const expected = decision.action === "partial_release" ? decision.release : s.amount;
        const wantsSettled = decision.action === "correct_ifsc" || decision.action === "partial_release";
        for (let i = 0; wantsSettled && latest.status !== "SETTLED" && i < 6; i++) {
          ctx.log("resolution", "info", `Status is ${latest.status}, checking again.`);
          await ctx.sleep(300);
          latest = await tools.pollSettlement(vc, s.txn);
        }

        let result: Outcome;
        let text: string;
        if (wantsSettled) {
          const ok = latest.status === "SETTLED" && latest.settledAmount === expected;
          result = ok ? "resolved" : "failed";
          text = ok ? `status=SETTLED, ${inr(expected)} confirmed via API` : `status=${latest.status}, could not confirm the settlement`;
        } else {
          const needsRekyc = decision.action === "escalate_kyc";
          // Safe means the settlement is exactly as it was: still held or still failed, with nothing moved.
          const unchanged = latest.status === "HELD" || latest.status === "FAILED";
          const held = unchanged && (!needsRekyc || ctx.world.rekyc.some((r) => r.merchantId === s.merchantId));
          result = held ? "escalated" : "failed";
          text = held
            ? needsRekyc
              ? `Settlement is safely ${latest.status.toLowerCase()} and a re-KYC request is on record`
              : `Settlement is safely left ${latest.status.toLowerCase()} and nothing was changed`
            : "Could not confirm a safe state";
        }
        ctx.log("resolution", result === "failed" ? "error" : "ok", text);
        verify.attrs.outcome = result;
        verify.attrs.verification = text;
        return { outcome: result, verification: text };
      },
      (r) => (r.outcome === "failed" ? "error" : "ok"),
    );
    if (outcome === "resolved") ctx.status("Verified", "ok", 0.92);
    ctx.emit({ type: "case", patch: { verification } });

    return { outcome, verified: outcome === "resolved", fix: fixText(decision), verification, retries, skippedOnResume };
  });
}

// What the merchant needs to know, in plain words. Used as the message itself when llama2 is off.
function plainSummary(s: Settlement, d: Decision, diag: Diagnosis, resolved: boolean): string {
  if (d.action === "correct_ifsc" && resolved) {
    return `the bank code on file for your payout account was wrong. We corrected it and re-sent your payout of ${inr(s.amount)} (txn ${s.txn}). It has now settled. You do not need to do anything.`;
  }
  if (d.action === "partial_release" && resolved && d.retain === 0) {
    return `your payout of ${inr(s.amount)} (txn ${s.txn}) was held for a routine check. The check is complete and the full amount has been released.`;
  }
  if (d.action === "partial_release" && resolved) {
    return `${inr(d.release)} of your ${inr(s.amount)} payout (txn ${s.txn}) has been released. ${inr(d.retain)} is on a short review because of unusual card activity, and we will update you when it ends.`;
  }
  if (d.action === "escalate_kyc") {
    const doc = diag.facts.kyc?.find((k) => k.status === "EXPIRED");
    return `your payout of ${inr(s.amount)} (txn ${s.txn}) is on hold because your ${doc?.type ?? "KYC document"} has expired. Please upload a renewed copy and our team will review it and release the funds.`;
  }
  return `your payout of ${inr(s.amount)} (txn ${s.txn}) needs one more check from our team. Nothing has been lost, and we will update you.`;
}

function fixText(d: Decision): string {
  if (d.action === "correct_ifsc") return `IFSC corrected to ${d.ifsc}, settlement retriggered`;
  if (d.action === "partial_release" && d.retain === 0) return `${inr(d.release)} released in full`;
  if (d.action === "partial_release") return `${inr(d.release)} released, ${inr(d.retain)} retained for review`;
  if (d.action === "escalate_kyc") return "Re-KYC requested, human review needed";
  return "Changed nothing, escalated to a person";
}

// ---- Closure -----------------------------------------------------------------------------------

// The model writes the subject line of the merchant email while Resolution is still working, assuming the
// plan succeeds. The body is never model text: it is built from verified facts, so the model cannot get a
// number, a name or a promise wrong. If the real outcome differs, the draft is discarded.
export type Draft = { expectedResolved: boolean; promise: Promise<{ text: string; narrated: boolean }>; isDone: () => boolean };

// How long the model may take before the built-in subject line is used.
const DRAFT_BUDGET_MS = 15_000;

// Words that say the money moved. They are false in a subject for a case that is still held or failed.
const SUCCESS_WORDS = /\b(confirm(ed|ation|s)?|releas(e|ed|es)|complet(e|ed|ion)|settled|success(ful(ly)?)?|processed|paid|credited|fixed|resolved|approved)\b/i;
// Words that say it went wrong. They are false in a subject for a case the agents resolved.
const FAILURE_WORDS = /\b(failed|failure|unable|rejected|escalat\w*|denied|declined)\b/i;

// `good` is whether the case is expected to end resolved. The model's subject must not say the opposite.
function cleanSubject(raw: string, good: boolean): string | null {
  const line = raw
    .split("\n")[0]
    .replace(/^["'`\s]+/, "")
    .replace(/^subject\s*:\s*/i, "")
    // A subject that starts a reply or forward claims an email thread that does not exist.
    .replace(/^(re|fwd?)\s*:\s*/i, "")
    .replace(/^["'`]+|["'`.]+$/g, "")
    // Small models sometimes repeat a word ("Payout payout settled").
    .replace(/\b(\w+)(\s+\1\b)+/gi, "$1")
    .trim();
  if (line.length < 8 || line.length > 90) return null;
  // The model may not make promises or add urgency. A subject that does falls back to the built-in one.
  if (/\b(immediate(ly)?|urgent(ly)?|asap|guarantee[ds]?|right away|within \d+|today|tomorrow|soon|final notice)\b/i.test(line)) return null;
  if (good ? FAILURE_WORDS.test(line) : SUCCESS_WORDS.test(line)) return null;
  return line.charAt(0).toUpperCase() + line.slice(1);
}

function fallbackSubject(d: Decision, resolved: boolean): string {
  if (d.action === "correct_ifsc" && resolved) return "Your payout has been fixed and settled";
  if (d.action === "partial_release" && resolved && d.retain === 0) return "Your held payout has been released";
  if (d.action === "partial_release" && resolved) return "Part of your payout is released, the rest is under review";
  if (d.action === "escalate_kyc") return "Action needed to release your payout";
  return "Your payout needs one more check";
}

export function startDraft(ctx: RunContext, parent: Span, s: Settlement, decision: Decision, diag: Diagnosis): Draft {
  const expectedResolved = decision.action === "correct_ifsc" || decision.action === "partial_release";
  const plain = plainSummary(s, decision, diag, expectedResolved);
  const promise = ctx
    .narrate({
      agent: "closure",
      parent,
      name: "llm.write_subject_line",
      system: SYSTEM,
      prompt: `Write an email subject line of at most 8 words for this message to a merchant. Reply with the subject line only, no quotes. Message: ${plain}`,
      fallback: fallbackSubject(decision, expectedResolved),
      maxTokens: 24,
      timeoutMs: DRAFT_BUDGET_MS,
    })
    .then((r) => {
      const subject = r.narrated ? cleanSubject(r.text, expectedResolved) : null;
      return subject ? { text: subject, narrated: true } : { text: r.text, narrated: false };
    });
  ctx.pending.push(promise);
  let done = false;
  void promise.then(() => (done = true));
  return { expectedResolved, promise, isDone: () => done };
}

export async function close(
  ctx: RunContext,
  parent: Span,
  s: Settlement,
  diag: Diagnosis,
  decision: Decision,
  res: Resolved,
  draft: Draft,
): Promise<RunReport> {
  return ctx.asAgent("closure", "closure.run", parent, async (span) => {
    const c = { ctx, agent: "closure" as const, parent: span };
    const merchant = ctx.world.merchants[s.merchantId];
    const resolved = res.outcome === "resolved";

    const kbEntry = `${s.failureCode}: ${diag.rootCause}. Fix: ${res.fix}. Evidence tools: ${diag.evidenceTools.join(", ")}. Outcome: ${res.outcome}.`;
    const kb = await tools.writeKb(c, s.txn, kbEntry);
    ctx.log("closure", "ok", `Knowledge base article ${kb.articleId} written.`);

    // The case is already fixed and verified here. Say what the remaining wait is, so it is not silent.
    if (ctx.llmOn && !draft.isDone()) ctx.log("closure", "info", `Case is verified. Waiting up to ${DRAFT_BUDGET_MS / 1000} s for ${MODEL} to write the email subject line.`);
    const drafted = await draft.promise;
    const useDraft = drafted.narrated && draft.expectedResolved === resolved;
    if (drafted.narrated && !useDraft) ctx.log("closure", "warn", "The outcome differed from what the subject line assumed, so the built-in subject is used instead.");
    const subject = useDraft ? drafted.text : fallbackSubject(decision, resolved);
    const message = `Subject: ${subject}\n\nHello ${merchant.name} team, ${plainSummary(s, decision, diag, resolved)}`;
    await tools.notifyMerchant(c, s.merchantId, "email", message);
    ctx.log("closure", "ok", `Merchant notified by email.${useDraft ? ` Subject line written by ${MODEL}.` : ""}`);

    const final = ctx.checkpoint("closure", "closed", { txn: s.txn, outcome: res.outcome, kb: kb.articleId }, span);
    // Only a case that produced real evidence teaches a playbook. A shrug is not a lesson.
    if ((res.outcome === "resolved" || res.outcome === "escalated") && diag.evidenceTools.length > 0) {
      memory.learn({
        pattern: s.failureCode,
        summary: `${diag.rootCause}.`,
        minimalTools: diag.evidenceTools,
        fix: res.fix,
        checkpoint: final.id,
        toolCalls: ctx.cost.toolCalls,
        durationMs: ctx.now(),
      });
      ctx.log("closure", "info", "Memory: pattern saved, so the next similar case starts with this playbook.");
    }

    ctx.status(resolved ? "Closed, verified" : "Escalated to human", resolved ? "ok" : "work", resolved ? 1 : 0.85);

    const actions = [
      diag.memoryHit ? "Reused a playbook from memory" : "Swept payments, KYC and risk data",
      decision.arbitrated ? "Coordinator ruled on a disagreement" : null,
      res.fix,
      res.retries > 0 ? `Recovered from ${res.retries} failed call${res.retries === 1 ? "" : "s"} by resuming a checkpoint` : null,
      res.verification,
    ].filter((a): a is string => a !== null);

    return {
      headline: resolved ? `Case ${s.txn} closed and verified` : `Case ${s.txn} escalated with everything prepared`,
      rootCause: diag.rootCause,
      actions,
      merchantMessage: message,
      kbEntry,
      narrated: useDraft,
    };
  });
}
