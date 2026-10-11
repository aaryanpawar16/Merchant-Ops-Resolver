import type { BatchCaseResult } from "@/lib/engine/types";
import type { FailureCode } from "@/lib/engine/world";

export const inr = (n: number) => `INR ${n.toLocaleString("en-IN")}`;

export const PATTERN_LABEL: Record<FailureCode, string> = {
  IFSC_ACCOUNT_MISMATCH: "Bank details mismatch",
  KYC_DOCUMENT_EXPIRED: "KYC or compliance hold",
  RISK_VELOCITY_SPIKE: "Risk hold",
  UNCLASSIFIED: "Unrecognised reason",
};

export const OUTCOME_STYLE: Record<string, { label: string; className: string }> = {
  resolved: { label: "Resolved", className: "border-lime/60 text-lime" },
  escalated: { label: "Escalated", className: "border-teal/60 text-teal" },
  failed: { label: "Failed", className: "border-ember/60 text-ember" },
};

// What a person has to do next when the agents stop. Written for the escalation queue.
export function humanNextStep(result: BatchCaseResult): string {
  // When the agents could not confirm a cause they changed nothing, so do not describe steps they never took.
  const unconfirmed = result.rootCause.startsWith("Could not");
  switch (result.pattern) {
    case "IFSC_ACCOUNT_MISMATCH":
      return "Ask the merchant or the bank for the correct IFSC code, then retrigger the payout.";
    case "KYC_DOCUMENT_EXPIRED":
      return unconfirmed
        ? "Ask the compliance team why this settlement is held. The KYC document on file looks valid, so the agents could not confirm the cause and requested nothing."
        : "Review the renewed document once the merchant uploads it, then release the funds.";
    case "RISK_VELOCITY_SPIKE":
      return "Review the flagged transactions and decide whether to release, partly release or keep the hold.";
    default:
      return "Look up the error with the bank or processor. The agents could not map it to a known cause.";
  }
}
