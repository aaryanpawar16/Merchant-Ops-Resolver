import { GlassCard } from "@/components/ui/GlassCard";
import { SectionHeading } from "@/components/ui/SectionHeading";

const outcomes = [
  {
    title: "Minutes, not hours",
    body: "Routine cases resolve with no dashboards opened.",
    span: "md:col-span-4",
  },
  {
    title: "Compounding speed",
    body: "Each resolved case makes the next similar one faster.",
    span: "md:col-span-2",
  },
  {
    title: "Recovers from failure",
    body: "A timeout does not kill the case. The agent retries another way.",
    span: "md:col-span-2",
  },
  {
    title: "Verified, not assumed",
    body: "Every fix is re-checked against the real system before closing.",
    span: "md:col-span-4",
  },
];

export function Outcome() {
  return (
    <section
      id="outcome"
      aria-labelledby="outcome-title"
      className="mx-auto max-w-[1240px] scroll-mt-14 px-5 py-24 md:px-8 md:py-36"
    >
      <SectionHeading id="outcome-title" index="05" label="Outcome" title="What changes when the case closes itself" />
      <div className="grid gap-4 md:grid-cols-6">
        {outcomes.map((outcome, i) => (
          <GlassCard key={outcome.title} tilt data-reveal className={`flex min-h-64 flex-col justify-between p-7 md:p-9 ${outcome.span}`}>
            <p className="label flex items-center gap-3 text-lime">
              <span aria-hidden="true" className="size-2 bg-lime" />R{i + 1}
            </p>
            <div className="mt-10">
              <h3 className="display text-3xl md:text-4xl">{outcome.title}</h3>
              <p className="mt-3 max-w-[48ch] leading-relaxed text-mute">{outcome.body}</p>
            </div>
          </GlassCard>
        ))}
      </div>
    </section>
  );
}
