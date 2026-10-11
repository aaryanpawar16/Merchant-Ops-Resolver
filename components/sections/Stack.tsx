"use client";

import { ArrowUpRight } from "lucide-react";
import { useRef } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { gsap, MOTION_OK, useGSAP } from "@/lib/gsap";
import { sampleRun } from "@/lib/sampleRun";
import { isLinked, site } from "@/lib/site";

// Real data from a captured run of case txn 48213 with a forced bank timeout. See scripts/capture-sample-run.mjs.
const total = sampleRun.totalMs;
const spans = sampleRun.trace;

const barStyle: Record<string, string> = {
  agent: "bg-lime",
  llm: "bg-teal",
  tool: "bg-ink/70",
  decision: "bg-ink/35",
  retry: "bg-ember",
};

const legend = [
  { kind: "agent", label: "Agent" },
  { kind: "tool", label: "Tool call" },
  { kind: "decision", label: "Decision" },
  { kind: "retry", label: "Failed, then retried" },
];

function Panel({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[8px] border border-line bg-void/60">
      <p className="label flex justify-between gap-4 border-b border-line px-4 py-3">
        <span>{title}</span>
        <span className="text-mute">{note}</span>
      </p>
      {children}
    </div>
  );
}

function TraceFigure() {
  return (
    <Panel title="Trace waterfall" note={`Real run ${sampleRun.runId}`}>
      <ol className="trace space-y-2 px-4 py-4 font-mono text-[11px]">
        {spans.map((span, i) => (
          <li
            key={`${span.name}-${i}`}
            className="grid grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-x-3 sm:grid-cols-[13.75rem_minmax(0,1fr)_3.5rem]"
          >
            <span className="flex min-w-0 gap-2" style={{ paddingLeft: `${span.depth * 10}px` }}>
              <span className={`w-9 shrink-0 ${span.kind === "retry" ? "text-ember" : "text-mute"}`}>
                {span.kind === "retry" ? "tool" : span.kind}
              </span>
              <span className="truncate">{span.name}</span>
            </span>
            <span className="relative hidden h-2 bg-white/[0.04] sm:block">
              <span
                className={`trace-bar absolute inset-y-0 origin-left ${barStyle[span.kind]}`}
                style={{
                  left: `${(span.start / total) * 100}%`,
                  width: `${(span.ms / total) * 100}%`,
                  minWidth: "3px",
                }}
              />
            </span>
            <span className="text-right text-mute tabular-nums">{span.label}</span>
          </li>
        ))}
      </ol>
      <ul className="label flex flex-wrap gap-x-5 gap-y-2 border-t border-line px-4 py-3 text-mute">
        {legend.map((item) => (
          <li key={item.kind} className="flex items-center gap-2">
            <span aria-hidden="true" className={`h-2 w-4 ${barStyle[item.kind]}`} />
            {item.label}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

const checkpoints = sampleRun.checkpoints;

function CheckpointFigure() {
  return (
    <Panel title="Checkpoint chain" note={`Real run ${sampleRun.runId}`}>
      {sampleRun.memoryLine && (
        <p className="border-b border-line bg-teal/10 px-4 py-3 font-mono text-xs leading-relaxed">
          <span className="label mr-3 text-teal">Memory</span>
          {sampleRun.memoryLine}
        </p>
      )}
      <ol className="font-mono text-xs">
        {checkpoints.map((cp, i) => {
          const resumed = cp.id === sampleRun.resumedFrom;
          return (
            <li
              key={cp.id}
              className={`grid grid-cols-[1fr] items-baseline gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[9.5rem_5.5rem_1fr] ${
                i < checkpoints.length - 1 ? "border-b border-line" : ""
              }`}
            >
              <span className="text-mute">{cp.id}</span>
              <span className={`label ${resumed ? "text-ember" : "text-lime"}`}>{resumed ? "Resumed" : "Saved"}</span>
              <span>
                {cp.agent}: {cp.label}
                {resumed && <span className="mt-1 block text-mute">The bank call timed out. The retry resumed here, not from the start.</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

// From the cfo.ai business plan, Sep 2028, priced at $1.50 per resolved case plus a $1 platform fee,
// with 65% of cases resolved without a human. Cases per merchant (0.15 to 0.20 a month) is an estimate.
const economics = [
  { label: "Merchants", value: 67, decimals: 0, prefix: "", suffix: "k" },
  { label: "Revenue", value: 82, decimals: 0, prefix: "$", suffix: "k / mo" },
  { label: "Model cost per case", value: 0.014, decimals: 3, prefix: "$", suffix: "" },
  { label: "Gross margin", value: 89, decimals: 0, prefix: "", suffix: "%" },
  { label: "Break-even", value: 34, decimals: 0, prefix: "", suffix: "k merchants" },
  { label: "Lowest cash", value: 24, decimals: 0, prefix: "$", suffix: "k" },
];

function EconomicsFigure() {
  return (
    <Panel title="Business plan, Sep 2028" note="From the cfo.ai plan">
      <dl className="grid grid-cols-2 sm:grid-cols-3">
        {economics.map((row) => (
          <div key={row.label} className="border-r border-b border-line px-4 py-4">
            <dt className="label text-mute">{row.label}</dt>
            <dd className="display mt-2 text-3xl tabular-nums">
              {row.prefix}
              <span className="count" data-value={row.value} data-decimals={row.decimals}>
                {row.value.toFixed(row.decimals)}
              </span>
              <span className="ml-1 font-mono text-xs font-normal tracking-normal text-mute">{row.suffix}</span>
            </dd>
          </div>
        ))}
      </dl>
      <div className="px-4 py-4">
        <p className="label mb-2 flex justify-between text-mute">
          <span>Cost</span>
          <span>Margin</span>
        </p>
        <div aria-hidden="true" className="flex h-2.5 gap-1">
          <span className="w-[11%] bg-white/15" />
          <span className="margin-bar flex-1 origin-left bg-lime" />
        </div>
        <p className="mt-3 font-mono text-[11px] leading-relaxed text-mute">
          $1.50 per resolved case plus a $1 platform fee, cash positive for all 24 months. Cases per merchant is an estimate.
        </p>
      </div>
    </Panel>
  );
}

const tools = [
  {
    code: "S1",
    name: "neatlogs",
    tagline: "Every run, every step, in context.",
    body: "Every model call, tool call, retry and cost, so a failure is a 30 second lookup.",
    figure: <TraceFigure />,
    href: site.links.neatlogs,
    linkLabel: "Open a trace in neatlogs",
  },
  {
    code: "S2",
    name: "Entire",
    tagline: "Checkpointed, so nothing starts cold.",
    body: "The agents save a hash-linked checkpoint after every step, so a retry resumes where it stopped. This project was built the same way, with Entire recording each coding session against its commits.",
    figure: <CheckpointFigure />,
    href: site.links.entire,
    linkLabel: "Open the Entire checkpoint of this build",
  },
  {
    code: "S3",
    name: "cfo.ai",
    tagline: "Priced like a real product, not a demo.",
    body: "A monthly model of customers, revenue, cost, margin and runway.",
    figure: <EconomicsFigure />,
    href: site.links.plan,
    linkLabel: "Open the cfo.ai plan",
  },
];

export function Stack() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(MOTION_OK, () => {
        gsap.from(".trace-bar", {
          scaleX: 0,
          duration: 0.7,
          ease: "power3.out",
          stagger: 0.05,
          scrollTrigger: { trigger: ".trace", start: "top 80%" },
        });
        gsap.from(".margin-bar", {
          scaleX: 0,
          duration: 1.2,
          ease: "power3.out",
          scrollTrigger: { trigger: ".margin-bar", start: "top 90%" },
        });
        gsap.utils.toArray<HTMLElement>(".count").forEach((el) => {
          const end = Number(el.dataset.value);
          const decimals = Number(el.dataset.decimals);
          const counter = { value: 0 };
          gsap.to(counter, {
            value: end,
            duration: 1.4,
            ease: "power2.out",
            scrollTrigger: { trigger: el, start: "top 90%" },
            onUpdate: () => {
              el.textContent = counter.value.toFixed(decimals);
            },
          });
        });
      });

      // Cards stack: each one settles back as the next slides over it.
      mm.add("(min-width: 1024px) and (prefers-reduced-motion: no-preference)", () => {
        const cards = gsap.utils.toArray<HTMLElement>(".stack-card");
        cards.forEach((card, i) => {
          if (i === cards.length - 1) return;
          gsap.to(card.querySelector(".stack-inner"), {
            scale: 0.93,
            opacity: 0.4,
            ease: "none",
            scrollTrigger: { trigger: cards[i + 1], start: "top 85%", end: "top 120px", scrub: true },
          });
        });
      });
    },
    { scope: root },
  );

  return (
    <section
      ref={root}
      id="stack"
      aria-labelledby="stack-title"
      className="mx-auto max-w-[1240px] scroll-mt-14 px-5 py-24 md:px-8 md:py-36"
    >
      <SectionHeading
        id="stack-title"
        index="04"
        label="Stack"
        title="Traced, checkpointed and priced"
      />
      <div className="space-y-6">
        {tools.map((tool, i) => (
          <div key={tool.name} className="stack-card lg:sticky" style={{ top: `${88 + i * 18}px` }}>
            <GlassCard
              solid
              className="stack-inner grid origin-top items-center gap-8 p-7 md:p-10 lg:min-h-[31rem] lg:grid-cols-12 lg:gap-12"
            >
              <div className="lg:col-span-5">
                <p className="label">
                  <span className="text-lime">{tool.code}</span>
                  <span className="mx-2 text-mute">/</span>
                  {tool.name}
                </p>
                <h3 className="display mt-5 max-w-[14ch] text-4xl text-balance md:text-5xl">{tool.tagline}</h3>
                <p className="mt-5 max-w-[46ch] leading-relaxed text-mute">{tool.body}</p>
                {isLinked(tool.href) && (
                  <a href={tool.href} target="_blank" rel="noreferrer" className="label mt-6 inline-flex items-center gap-2 text-ink transition-colors hover:text-lime">
                    {tool.linkLabel}
                    <ArrowUpRight aria-hidden="true" className="size-3.5" />
                  </a>
                )}
              </div>
              <div className="min-w-0 lg:col-span-7">{tool.figure}</div>
            </GlassCard>
          </div>
        ))}
      </div>
    </section>
  );
}
