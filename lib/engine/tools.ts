import { memory, type MemoryEntry } from "@/lib/engine/checkpoints";
import { RunContext, ToolTimeout } from "@/lib/engine/runtime";
import type { AgentId, Span } from "@/lib/engine/types";
import { bankFromIfsc, IFSC_DIRECTORY, type Settlement, type SettlementView } from "@/lib/engine/world";


// Policy the Resolution worker must obey. The agents cannot argue their way past it.
export const AUTO_RELEASE_LIMIT_INR = 250000;
const FORBIDDEN_ACTIONS = new Set(["modify_kyc_status", "waive_kyc_requirement"]);

const jitter = (base: number) => Math.round(base + Math.random() * base * 0.6);

type Ctx = { ctx: RunContext; agent: AgentId; parent: Span | null };

function refresh(s: Settlement) {
  if (s.status === "PROCESSING" && s.settleAt !== null && Date.now() >= s.settleAt) {
    s.status = "SETTLED";
    s.settleAt = null;
  }
}

function settlementOf({ ctx }: Ctx, txn: string): Settlement {
  const s = ctx.world.settlements[txn];
  if (!s) throw new Error(`settlement ${txn} not found`);
  refresh(s);
  return s;
}

// ---- reads -------------------------------------------------------------------------------------

// What the bank API shows an agent about a settlement. The bank's payout counter and idempotency-key store are internal
// to the bank. Showing them would let an agent spot a double payout that a real bank API would not reveal, so only the
// world (and the scorecard) can see them. Every read an agent can make must go through this.
function bankView(s: Settlement): SettlementView {
  const view: Partial<Settlement> = structuredClone(s);
  delete view.payouts;
  delete view.idempotencyKeys;
  return view as SettlementView;
}

export function getSettlement(c: Ctx, txn: string) {
  return c.ctx.tool(c.agent, c.parent, "get_settlement", { txn }, { latency: jitter(150) }, (): SettlementView => bankView(settlementOf(c, txn)));
}

export function getMerchantProfile(c: Ctx, merchantId: string) {
  return c.ctx.tool(c.agent, c.parent, "get_merchant_profile", { merchantId }, { latency: jitter(170) }, () => {
    const m = c.ctx.world.merchants[merchantId];
    if (!m) throw new Error(`merchant ${merchantId} not found`);
    return { ...m };
  });
}

export function getKyc(c: Ctx, merchantId: string) {
  return c.ctx.tool(c.agent, c.parent, "get_kyc", { merchantId }, { latency: jitter(180) }, () => c.ctx.world.kyc[merchantId] ?? []);
}

export function getRiskSignals(c: Ctx, merchantId: string) {
  return c.ctx.tool(c.agent, c.parent, "get_risk_signals", { merchantId }, { latency: jitter(220) }, () => c.ctx.world.risk[merchantId] ?? null);
}

export function lookupIfsc(c: Ctx, ifsc: string) {
  return c.ctx.tool(c.agent, c.parent, "lookup_ifsc", { ifsc }, { latency: jitter(130) }, () => {
    const hit = IFSC_DIRECTORY[ifsc];
    if (hit) return { found: true, ...hit };
    // Uploaded files use real-looking codes the small directory does not list, so fall back to the bank prefix.
    const bank = bankFromIfsc(ifsc);
    return bank === "an unknown bank" ? { found: false } : { found: true, bank, branch: "branch not listed" };
  });
}

export type BeneficiaryCheck =
  | { accountFound: false }
  | { accountFound: true; holder: string; actualIfsc: string; actualBank: string; ifscOnFileMatches: boolean };

export function verifyBeneficiary(c: Ctx, account: string, ifscOnFile: string) {
  return c.ctx.tool(c.agent, c.parent, "verify_beneficiary", { account, ifscOnFile }, { latency: jitter(420), attrs: { method: "penny_drop" } }, (): BeneficiaryCheck => {
    const real = c.ctx.world.bankLedger[account];
    if (!real) return { accountFound: false };
    return {
      accountFound: true,
      holder: real.holder,
      actualIfsc: real.ifsc,
      actualBank: bankFromIfsc(real.ifsc),
      ifscOnFileMatches: real.ifsc === ifscOnFile,
    };
  });
}

export type MemoryLookup = { hit: false } | ({ hit: true } & MemoryEntry);

export function searchMemory(c: Ctx, pattern: string) {
  const options = {
    latency: jitter(90),
    neatlogs: "RETRIEVER" as const,
    annotate: (r: MemoryLookup) => ({
      "neatlogs.retriever.query": pattern,
      "neatlogs.retriever.top_k": 1,
      "neatlogs.retriever.documents": JSON.stringify(r.hit ? [r] : []),
    }),
  };
  return c.ctx.tool(c.agent, c.parent, "search_memory", { pattern, store: "memory" }, options, (): MemoryLookup => {
    const found = memory.find(pattern);
    return found ? { hit: true, ...found } : { hit: false };
  });
}

type PolicyVerdict = { allowed: boolean; reason: string };

export function policyCheck(c: Ctx, action: string, amount?: number) {
  const options = {
    latency: jitter(60),
    neatlogs: "GUARDRAIL" as const,
    annotate: (r: PolicyVerdict) => ({
      "neatlogs.guardrail.input": amount !== undefined ? `${action} ${amount}` : action,
      "neatlogs.guardrail.passed": r.allowed,
      "neatlogs.guardrail.output": r.reason,
    }),
  };
  return c.ctx.tool(c.agent, c.parent, "policy_check", { action, ...(amount !== undefined ? { amount } : {}) }, options, (): PolicyVerdict => {
    if (FORBIDDEN_ACTIONS.has(action)) return { allowed: false, reason: "Compliance status can only be changed by a human reviewer." };
    if (action === "release_hold" && amount !== undefined && amount > AUTO_RELEASE_LIMIT_INR) {
      return { allowed: false, reason: `Releases above INR ${AUTO_RELEASE_LIMIT_INR} need human approval.` };
    }
    return { allowed: true, reason: "Within autonomous limits." };
  });
}

// ---- writes ------------------------------------------------------------------------------------

export function updateBankIfsc(c: Ctx, merchantId: string, ifsc: string, txn: string) {
  return c.ctx.tool(c.agent, c.parent, "update_bank_ifsc", { merchantId, ifsc }, { latency: jitter(210) }, () => {
    const merchant = c.ctx.world.merchants[merchantId];
    merchant.bank.ifsc = ifsc;
    c.ctx.world.settlements[txn].beneficiary.ifsc = ifsc;
    return { updated: true, merchantId, ifsc };
  });
}

export async function retriggerSettlement(c: Ctx, txn: string, rail: "NEFT" | "IMPS", key: string) {
  const timeout = rail === "NEFT" && c.ctx.chaosHit();
  return c.ctx.tool(c.agent, c.parent, "retrigger_settlement", { txn, rail, idempotencyKey: key }, { latency: timeout ? 1200 : jitter(260) }, () => {
    // A clean timeout means the bank never saw the request. The ambiguous kind is the dangerous one: the bank
    // accepted and paid, and only the reply was lost, so the caller cannot tell whether it worked.
    if (timeout && !c.ctx.flags.ambiguous) throw new ToolTimeout("bank API timeout (504) after 1.2 s");
    const s = settlementOf(c, txn);
    if (s.idempotencyKeys.includes(key)) {
      if (timeout) throw new ToolTimeout("bank API timeout (504) after 1.2 s");
      return { accepted: true, duplicate: true };
    }
    s.idempotencyKeys.push(key);
    s.status = "PROCESSING";
    s.rail = rail;
    s.settledAmount = s.amount;
    s.payouts += 1;
    s.settleAt = Date.now() + 650 * c.ctx.speed;
    if (timeout) throw new ToolTimeout("bank API timeout (504) after 1.2 s, the request may have gone through");
    return { accepted: true, duplicate: false, rail };
  });
}

export async function releaseHold(c: Ctx, txn: string, releaseAmount: number, retainAmount: number, key: string) {
  const timeout = c.ctx.chaosHit();
  return c.ctx.tool(c.agent, c.parent, "release_hold", { txn, release: releaseAmount, retain: retainAmount, idempotencyKey: key }, { latency: timeout ? 1200 : jitter(280) }, () => {
    if (timeout && !c.ctx.flags.ambiguous) throw new ToolTimeout("settlement API timeout (504) after 1.2 s");
    const s = settlementOf(c, txn);
    if (s.idempotencyKeys.includes(key)) {
      if (timeout) throw new ToolTimeout("settlement API timeout (504) after 1.2 s");
      return { accepted: true, duplicate: true };
    }
    s.idempotencyKeys.push(key);
    s.status = "PROCESSING";
    s.settledAmount = releaseAmount;
    s.retained = retainAmount;
    s.payouts += 1;
    s.settleAt = Date.now() + 650 * c.ctx.speed;
    if (timeout) throw new ToolTimeout("settlement API timeout (504) after 1.2 s, the request may have gone through");
    return { accepted: true, duplicate: false, release: releaseAmount, retain: retainAmount };
  });
}

export async function requestRekyc(c: Ctx, merchantId: string, channel: "email" | "sms") {
  const timeout = channel === "email" && c.ctx.chaosHit();
  return c.ctx.tool(c.agent, c.parent, "request_rekyc", { merchantId, channel }, { latency: timeout ? 1200 : jitter(240) }, () => {
    if (timeout) throw new ToolTimeout("notification service timeout (504) after 1.2 s");
    c.ctx.world.rekyc.push({ merchantId, channel });
    return { requested: true, channel };
  });
}

export function writeKb(c: Ctx, txn: string, entry: string) {
  return c.ctx.tool(c.agent, c.parent, "write_kb", { txn }, { latency: jitter(220) }, () => {
    c.ctx.world.kb.push({ txn, entry });
    return { written: true, articleId: `KB-${txn}` };
  });
}

export function notifyMerchant(c: Ctx, merchantId: string, channel: string, body: string) {
  return c.ctx.tool(c.agent, c.parent, "notify_merchant", { merchantId, channel }, { latency: jitter(200) }, () => {
    c.ctx.world.notifications.push({ merchantId, channel, body });
    return { sent: true, channel };
  });
}

export function pollSettlement(c: Ctx, txn: string) {
  return c.ctx.tool(c.agent, c.parent, "get_settlement", { txn, purpose: "verify" }, { latency: jitter(180) }, (): SettlementView => bankView(settlementOf(c, txn)));
}
