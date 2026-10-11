import type { Tone } from "@/lib/caseStatus";
import { sampleTimings } from "@/lib/sampleRun";

export type Node = "ops" | "coordinator" | "investigation" | "resolution" | "closure" | "all";

// Timings come from a real captured run of this case (lib/sampleRun.ts), not from guesses.
export const steps: {
  actor: string;
  node: Node;
  event: string;
  result: string;
  detail: string;
  hud: string;
  tone: Tone;
}[] = [
  {
    actor: "ops console",
    node: "ops",
    event: "Ops types: \"Sharma Kirana's settlement for txn #48213 failed. Investigate and resolve.\"",
    result: "received",
    detail: sampleTimings.received,
    hud: "Settlement failed",
    tone: "fault",
  },
  {
    actor: "coordinator",
    node: "coordinator",
    event: "Coordinator plans the approach and assigns the workers.",
    result: "planned",
    detail: sampleTimings.planned,
    hud: "Planning",
    tone: "work",
  },
  {
    actor: "investigation",
    node: "investigation",
    event:
      "Investigation finds a mismatched bank IFSC code, using a saved playbook from a similar case.",
    result: "root cause",
    detail: sampleTimings.investigated,
    hud: "Root cause found",
    tone: "work",
  },
  {
    actor: "resolution",
    node: "resolution",
    event: "Resolution corrects the IFSC and retriggers the settlement via API.",
    result: "applied",
    detail: sampleTimings.applied,
    hud: "Fix applied",
    tone: "work",
  },
  {
    actor: "resolution",
    node: "resolution",
    event:
      "Resolution re-checks settlement status via API. Verified, not assumed.",
    result: "verified",
    detail: sampleTimings.verified,
    hud: "Verified",
    tone: "ok",
  },
  {
    actor: "closure",
    node: "closure",
    event: "Closure updates the knowledge base and reports the outcome.",
    result: "closed",
    detail: sampleTimings.closed,
    hud: "Closed",
    tone: "ok",
  },
  {
    actor: "neatlogs",
    node: "all",
    event: "The full run is visible as a neatlogs trace.",
    result: "traced",
    detail: sampleTimings.traced,
    hud: "Closed, verified",
    tone: "ok",
  },
];
