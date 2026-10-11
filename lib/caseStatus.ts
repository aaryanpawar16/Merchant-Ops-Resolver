export type Tone = "fault" | "work" | "ok";

// repair runs from 0 (case broken) to 1 (case whole). The 3D core assembles as it rises.
export type CaseStatus = { status: string; tone: Tone; repair: number };

export const CASE_EVENT = "case-status";

const defaultRepair: Record<Tone, number> = { fault: 0, work: 0.5, ok: 1 };

// The page tells one story: a case moving from failed to closed. Sections call this as they
// scroll into view; the backdrop, the accent colour, the HUD and the 3D core all follow it.
export function setCase(status: string, tone: Tone, repair: number = defaultRepair[tone]) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (root.dataset.tone === tone && root.dataset.status === status) return;
  root.dataset.tone = tone;
  root.dataset.status = status;
  root.dataset.repair = String(repair);
  window.dispatchEvent(new CustomEvent<CaseStatus>(CASE_EVENT, { detail: { status, tone, repair } }));
}

// While the pinned case scene is being scrolled, it writes the repair value here every frame
// so the 3D core follows the reader's scroll directly instead of jumping between steps.
export const caseLive: { repair: number | null } = { repair: null };
