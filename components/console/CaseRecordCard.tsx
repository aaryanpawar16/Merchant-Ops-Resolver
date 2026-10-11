import type { Tone } from "@/lib/caseStatus";
import type { CaseRecord } from "@/lib/engine/types";

const toneBorder: Record<Tone, string> = { fault: "border-ember/60 text-ember", work: "border-teal/60 text-teal", ok: "border-lime/60 text-lime" };
const toneDot: Record<Tone, string> = { fault: "bg-ember", work: "bg-teal", ok: "bg-lime" };

// The live case record. It fills in as the agents learn things, like the card on the landing page.
export function CaseRecordCard({ record, status, tone, live }: { record: CaseRecord; status: string; tone: Tone; live: boolean }) {
  const rows: { field: string; value: string }[] = [
    { field: "Merchant", value: record.merchant },
    { field: "Fault", value: record.fault },
    { field: "Root cause", value: record.rootCause },
    { field: "Fix", value: record.fix },
    { field: "Verification", value: record.verification },
    { field: "Human input", value: record.humanInput },
  ];

  return (
    <div className="glass glass-tint overflow-hidden">
      <div className="label flex items-center justify-between gap-4 border-b border-line px-5 py-3.5">
        <span>{record.txn ? `Case txn ${record.txn}` : "No case yet"}</span>
        <span className={`flex items-center gap-2 rounded-[2px] border px-2 py-1 ${toneBorder[tone]}`} role="status">
          <span aria-hidden="true" className={`size-1.5 ${toneDot[tone]} ${live ? "animate-blink" : ""}`} />
          {status}
        </span>
      </div>
      <dl>
        {rows.map((row) => (
          <div key={row.field} className="grid grid-cols-[7rem_1fr] gap-x-4 border-b border-line px-5 py-3 last:border-b-0">
            <dt className="label pt-0.5 text-mute">{row.field}</dt>
            <dd className={`font-mono text-[13px] leading-snug ${row.value ? "" : "text-mute"}`}>{row.value || "Pending"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
