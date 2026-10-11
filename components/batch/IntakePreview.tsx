import { inr, PATTERN_LABEL } from "@/components/batch/labels";
import type { IntakeReport } from "@/lib/engine/intake";
import { MAX_CASES } from "@/lib/engine/intake";

// What the app understood from the file, shown before anything runs, so a wrong guess is caught early.
export function IntakePreview({ report }: { report: IntakeReport }) {
  const byPattern = report.cases.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.pattern]: (acc[c.pattern] ?? 0) + 1 }), {});
  const total = report.cases.reduce((sum, c) => sum + c.amount, 0);

  return (
    <div className="glass glass-tint space-y-5 px-5 py-5">
      <div>
        <p className="label text-mute">What the agents found in {report.filename}</p>
        <p className="display mt-3 text-3xl sm:text-4xl">
          {report.cases.length} case{report.cases.length === 1 ? "" : "s"} to resolve, {inr(total)}
        </p>
        <p className="mt-2 text-[14px] leading-relaxed text-mute">
          {report.rowCount} rows read. {report.history} already settled (used as history), {report.rejected.length} skipped.
          {report.truncated && ` Only the first ${MAX_CASES} cases will be processed in this demo.`}
        </p>
      </div>

      <ul className="flex flex-wrap gap-2">
        {Object.entries(byPattern).map(([pattern, count]) => (
          <li key={pattern} className="label rounded-[2px] border border-line px-2.5 py-1.5">
            {count} x {PATTERN_LABEL[pattern as keyof typeof PATTERN_LABEL]}
          </li>
        ))}
      </ul>

      <details className="group">
        <summary className="label cursor-pointer text-mute hover:text-ink">Columns understood ({report.columns.length})</summary>
        <ul className="mt-3 grid gap-x-6 gap-y-1 font-mono text-[12px] sm:grid-cols-2">
          {report.columns.map((c) => (
            <li key={c.field}>
              <span className="text-ink">{c.source}</span> <span className="text-mute">as {c.field}</span>
            </li>
          ))}
        </ul>
        {report.ignoredColumns.length > 0 && <p className="mt-3 font-mono text-[12px] text-mute">Ignored: {report.ignoredColumns.join(", ")}</p>}
      </details>

      {report.rejected.length > 0 && (
        <div className="rounded-[2px] border border-ember/50 px-4 py-3">
          <p className="label text-ember">Skipped rows</p>
          <ul className="mt-2 space-y-1 font-mono text-[12px] leading-snug">
            {report.rejected.slice(0, 8).map((r) => (
              <li key={r.row}>
                Row {r.row}: {r.reason}
              </li>
            ))}
            {report.rejected.length > 8 && <li className="text-mute">and {report.rejected.length - 8} more</li>}
          </ul>
        </div>
      )}

      {report.warnings.length > 0 && (
        <ul className="space-y-1 font-mono text-[12px] leading-snug text-mute">
          {report.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
