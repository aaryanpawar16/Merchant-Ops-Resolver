import { ChevronDown } from "lucide-react";
import type { WhyNot } from "@/lib/engine/types";

const pct = (n: number) => `${Math.round(n * 100)}%`;

function Confidence({ confidence }: { confidence: NonNullable<WhyNot["confidence"]> }) {
  const { label, value, needed } = confidence;
  const clear = needed === null || value >= needed;
  return (
    <div>
      <p className="label flex flex-wrap items-baseline justify-between gap-x-3 text-mute">
        <span>{label}</span>
        <span className={`tabular-nums ${needed !== null && !clear ? "text-ember" : "text-ink"}`}>
          {pct(value)}
          {needed !== null ? (clear ? ` (${pct(needed)} needed)` : `, ${pct(needed)} needed`) : ""}
        </span>
      </p>
      <div className="relative mt-1.5 h-1.5 bg-white/10" aria-hidden="true">
        <div className={`h-full ${needed !== null && !clear ? "bg-ember" : "bg-lime"}`} style={{ width: pct(value) }} />
        {needed !== null && <div className="absolute inset-y-[-3px] w-px bg-ink" style={{ left: pct(needed) }} />}
      </div>
      {needed === null && <p className="mt-1.5 font-mono text-[11px] leading-snug text-mute">Confidence is not what decided this. A rule did.</p>}
    </div>
  );
}

// "Why did it decide that?" for one case: the rule that blocked a more automatic action, the confidence gap, and
// what would flip the decision. Written from the rules the Coordinator used, never by the model.
export function WhyNotPanel({ why, defaultOpen = false }: { why: WhyNot; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group rounded-[2px] border border-line bg-black/20">
      <summary className="label flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-2.5 transition-colors hover:text-lime [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2.5">
          <span aria-hidden="true" className={`size-1.5 ${why.automatic ? "bg-lime" : "bg-teal"}`} />
          {why.question}
        </span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-mute transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-3.5 border-t border-line px-3.5 py-3.5 text-[13px] leading-snug">
        <p>{why.answer}</p>

        {why.confidence && <Confidence confidence={why.confidence} />}

        {why.blockers.length > 0 && (
          <div>
            <p className="label mb-1.5 text-mute">What stopped it</p>
            <ul className="space-y-1.5">
              {why.blockers.map((b) => (
                <li key={b.rule} className="font-mono text-[12px] leading-snug">
                  <span className="text-ember">{b.rule}.</span> {b.detail}
                </li>
              ))}
            </ul>
          </div>
        )}

        {why.wouldChange.length > 0 && (
          <div>
            <p className="label mb-1.5 text-mute">What would change it</p>
            <ul className="space-y-1.5">
              {why.wouldChange.map((line) => (
                <li key={line} className="flex gap-2 font-mono text-[12px] leading-snug">
                  <span aria-hidden="true" className="text-mute">
                    -
                  </span>
                  {line}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}
