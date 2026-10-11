const open = [
  { field: "Merchant", value: "Sharma Kirana" },
  { field: "Fault", value: "Settlement failed" },
  { field: "Root cause", value: "Unknown", pending: true },
  { field: "Fix", value: "Pending", pending: true },
  { field: "Verification", value: "Pending", pending: true },
  { field: "Human input", value: "One instruction" },
];

const resolved = [
  { field: "Merchant", value: "Sharma Kirana" },
  { field: "Fault", value: "Settlement failed" },
  { field: "Root cause", value: "Bank IFSC code mismatch" },
  { field: "Fix", value: "IFSC corrected, settlement retriggered" },
  { field: "Verification", value: "Status re-checked via API" },
  { field: "Human input", value: "One instruction" },
];

// The same case record appears twice: open in the hero, resolved at the end of the page.
export function CaseCard({ state }: { state: "open" | "resolved" }) {
  const rows: { field: string; value: string; pending?: boolean }[] = state === "open" ? open : resolved;
  const isOpen = state === "open";

  return (
    <div className="glass glass-tint overflow-hidden">
      <div className="label flex items-center justify-between gap-4 border-b border-line px-5 py-3.5">
        <span>Case txn 48213</span>
        <span
          className={`flex items-center gap-2 rounded-[2px] border px-2 py-1 ${
            isOpen ? "border-ember/60 text-ember" : "border-lime/60 text-lime"
          }`}
        >
          <span aria-hidden="true" className={`size-1.5 ${isOpen ? "animate-blink bg-ember" : "bg-lime"}`} />
          {isOpen ? "Failed" : "Closed, verified"}
        </span>
      </div>
      <dl>
        {rows.map((row) => (
          <div
            key={row.field}
            className="grid grid-cols-[7rem_1fr] gap-x-4 border-b border-line px-5 py-3"
          >
            <dt className="label pt-0.5 text-mute">{row.field}</dt>
            <dd className={`font-mono text-[13px] leading-snug ${row.pending ? "text-mute" : ""}`}>{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="px-5 py-3.5 font-mono text-[13px]">
        <span className={isOpen ? "text-ember" : "text-lime"}>&gt;</span>{" "}
        {isOpen ? "investigate and resolve" : "case closed, knowledge base updated"}
        {isOpen && <span aria-hidden="true" className="ml-1 inline-block h-3.5 w-2 translate-y-0.5 animate-blink bg-ink" />}
      </p>
    </div>
  );
}
