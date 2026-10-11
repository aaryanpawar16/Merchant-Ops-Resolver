import { BENIGN_RELEASE_CONFIDENCE, MAX_RETAINED_SHARE, type Decision, type Diagnosis } from "@/lib/engine/agents";
import { AUTO_RELEASE_LIMIT_INR } from "@/lib/engine/tools";
import type { WhyNot } from "@/lib/engine/types";
import type { Settlement } from "@/lib/engine/world";

const inr = (n: number) => `INR ${n.toLocaleString("en-IN")}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const LIMIT = inr(AUTO_RELEASE_LIMIT_INR);

// Explains a decision from the same facts and the same thresholds the Coordinator used. It lists the rule that
// stopped a more automatic action, and what would have to change for the decision to flip. No model is involved,
// so it cannot embellish.
export function explainDecision(s: Settlement, diag: Diagnosis, d: Decision): WhyNot {
  const top = diag.findings[0];
  const handedOver = (answer: string, blockers: WhyNot["blockers"], wouldChange: string[], confidence: WhyNot["confidence"] = null): WhyNot => ({
    question: "Why was this not fixed automatically?",
    answer,
    automatic: false,
    blockers,
    wouldChange,
    confidence,
  });

  if (d.action === "correct_ifsc") {
    return {
      question: "Why did it fix this on its own?",
      answer: "The bank's own check found the account at a different IFSC code, and correcting bank details is within the agents' permissions.",
      automatic: true,
      blockers: [],
      wouldChange: ["If the bank check could not find the account, the agents would stop and hand the case to a person."],
      confidence: null,
    };
  }

  if (d.action === "escalate_kyc") {
    return handedOver(
      "Changing a compliance status is something only a human reviewer may do, however sure the agents are of the cause.",
      [{ rule: "Compliance policy", detail: "Compliance status can only be changed by a human reviewer." }],
      ["A compliance reviewer verifies a renewed document. Confidence in the cause would not change this: it is a permission, not a threshold."],
      top ? { label: "Confidence in the cause", value: top.confidence, needed: null } : null,
    );
  }

  if (d.action === "partial_release") {
    if (d.retain === 0) {
      return {
        question: "Why did it release this on its own?",
        answer: `Nothing suspicious was found, the evidence for genuine demand is ${pct(top.confidence)} (the bar is ${pct(BENIGN_RELEASE_CONFIDENCE)}), and ${inr(s.amount)} is within the ${LIMIT} autonomous limit.`,
        automatic: true,
        blockers: [],
        wouldChange: [`Below ${pct(BENIGN_RELEASE_CONFIDENCE)} confidence, or above ${LIMIT}, it would have been handed to a person.`, "A suspicious device cluster would have held back at least the amount tied to it."],
        confidence: { label: "Evidence of genuine demand", value: top.confidence, needed: BENIGN_RELEASE_CONFIDENCE },
      };
    }
    const cluster = diag.findings.find((f) => f.id === "device_cluster");
    return {
      question: "Why was only part of it released?",
      answer: `Two findings disagreed. The suspicious cluster is ${pct(d.retain / s.amount)} of the settlement, under the ${pct(MAX_RETAINED_SHARE)} limit for releasing around it, so ${inr(d.release)} went out and ${inr(d.retain)} stays held.`,
      automatic: true,
      blockers: [{ rule: "Held back for review", detail: `${inr(d.retain)} is tied to a suspicious device cluster and needs a person to clear it.` }],
      wouldChange: ["A reviewer clears the cluster, after which the held amount can be released.", `A cluster of ${pct(MAX_RETAINED_SHARE)} or more of the settlement would have held everything.`],
      confidence: cluster ? { label: "Suspicious cluster", value: cluster.confidence, needed: null } : null,
    };
  }

  // escalate_unknown: work out which of the possible reasons applied.
  if (diag.conflict) {
    const cluster = diag.facts.risk?.deviceCluster;
    const exposure = cluster?.amount ?? 0;
    const share = exposure / s.amount;
    const release = s.amount - exposure;
    const blockers: WhyNot["blockers"] = [];
    if (share >= MAX_RETAINED_SHARE) blockers.push({ rule: "Retained share limit", detail: `The suspicious cluster is ${pct(share)} of the settlement. Releasing around it is only allowed below ${pct(MAX_RETAINED_SHARE)}.` });
    if (release > AUTO_RELEASE_LIMIT_INR) blockers.push({ rule: "Autonomous release limit", detail: `Releasing the rest would be ${inr(release)}, above the ${LIMIT} the agents may release on their own.` });
    return handedOver(
      "Demand looks genuine but part of the volume looks like card testing, and the suspicious part is too large to release around.",
      blockers,
      [`A suspicious share under ${pct(MAX_RETAINED_SHARE)}, with the rest at or under ${LIMIT}, would have allowed a partial release.`, "A reviewer clearing the device cluster."],
    );
  }

  if (s.failureCode === "UNCLASSIFIED") {
    return handedOver(
      "The failure reason does not match any pattern the agents know, so there is no safe fix to apply.",
      [{ rule: "No matching rule", detail: "The agents never guess at a cause. Unrecognised reasons always go to a person." }],
      ["A failure reason the agents recognise: a bank IFSC mismatch, an expired KYC document, or a risk hold.", "A person deciding what to do."],
    );
  }

  if (s.failureCode === "RISK_VELOCITY_SPIKE") {
    if (!diag.facts.risk) {
      return handedOver(
        "No risk data came with this case, so the hold cannot be judged either way.",
        [{ rule: "Missing evidence", detail: "The agents will not release a risk hold without the merchant's risk signals." }],
        ["Risk signals for the merchant: volume against baseline, repeat customers, ticket size, chargebacks and device data."],
      );
    }
    if (top?.id === "device_cluster") {
      return handedOver(
        "The strongest finding is a suspicious device cluster, and it is not outweighed by evidence of genuine demand.",
        [{ rule: "Suspicious evidence", detail: top.hypothesis }],
        ["A reviewer clears the device cluster.", `Evidence of genuine demand reaching ${pct(BENIGN_RELEASE_CONFIDENCE)} with no suspicious cluster.`],
        { label: "Suspicious cluster", value: top.confidence, needed: null },
      );
    }
    const blockers: WhyNot["blockers"] = [];
    if (top && top.confidence < BENIGN_RELEASE_CONFIDENCE) blockers.push({ rule: "Confidence bar", detail: `Evidence for genuine demand is ${pct(top.confidence)}, below the ${pct(BENIGN_RELEASE_CONFIDENCE)} needed to release without a person.` });
    if (s.amount > AUTO_RELEASE_LIMIT_INR) blockers.push({ rule: "Autonomous release limit", detail: `${inr(s.amount)} is above the ${LIMIT} the agents may release on their own, whatever the evidence says.` });
    return handedOver(
      s.amount > AUTO_RELEASE_LIMIT_INR && top && top.confidence >= BENIGN_RELEASE_CONFIDENCE
        ? "The hold looks like genuine demand, but the amount is above what the agents may release without a person."
        : "The evidence for genuine demand is not strong enough to release the hold without a person.",
      blockers,
      [
        ...(top && top.confidence < BENIGN_RELEASE_CONFIDENCE ? [`Stronger evidence: ${pct(BENIGN_RELEASE_CONFIDENCE)} or more, for example repeat customers, normal ticket size, a low chargeback rate or the same week last year.`] : []),
        ...(s.amount > AUTO_RELEASE_LIMIT_INR ? [`An amount of ${LIMIT} or less, or a person approving the release.`] : []),
      ],
      top ? { label: "Evidence of genuine demand", value: top.confidence, needed: BENIGN_RELEASE_CONFIDENCE } : null,
    );
  }

  if (s.failureCode === "IFSC_ACCOUNT_MISMATCH") {
    return handedOver(
      "The bank check could not confirm which IFSC the account belongs to, so changing bank details is not safe.",
      [{ rule: "Unverified account", detail: "Bank details are only changed when the bank's own check finds the account." }],
      ["A bank check that finds the account, or a person confirming the details with the merchant."],
    );
  }

  return handedOver(
    "The KYC records do not show an expired document, so the cause could not be confirmed.",
    [{ rule: "Missing evidence", detail: "The agents act only on a cause they can point to evidence for." }],
    ["KYC records that show which document expired."],
  );
}
