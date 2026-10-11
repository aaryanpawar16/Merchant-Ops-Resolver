"use client";

import { BookCheck, Search, Workflow, Wrench, type LucideIcon } from "lucide-react";
import { useRef } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { gsap, MOTION_OK, useGSAP } from "@/lib/gsap";

const workers: { icon: LucideIcon; code: string; name: string; body: string; path: string }[] = [
  {
    icon: Search,
    code: "W1",
    name: "Investigation Worker",
    body: "Finds the real cause, checking saved memory for similar past cases first.",
    path: "M500 2 C500 70 158 50 158 118",
  },
  {
    icon: Wrench,
    code: "W2",
    name: "Resolution Worker",
    body: "Applies the fix via API, then re-verifies it.",
    path: "M500 2 L500 118",
  },
  {
    icon: BookCheck,
    code: "W3",
    name: "Closure Worker",
    body: "Updates the knowledge base and reports back.",
    path: "M500 2 C500 70 842 50 842 118",
  },
];

function AgentNode({ icon: Icon, code, name, body }: { icon: LucideIcon; code: string; name: string; body: string }) {
  return (
    <GlassCard className="agent-node h-full p-6">
      <div className="mb-5 flex items-center justify-between">
        <span className="flex size-11 items-center justify-center rounded-[6px] border border-teal/40 bg-teal/10 text-teal">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <span className="label text-mute">{code}</span>
      </div>
      <h3 className="display text-2xl">{name}</h3>
      <p className="mt-3 text-[15px] leading-relaxed text-mute">{body}</p>
    </GlassCard>
  );
}

export function System() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const timeline = gsap.timeline({
          scrollTrigger: { trigger: ".topology", start: "top 72%", end: "top 12%", scrub: 0.8 },
        });
        timeline
          .from(".agent-node-root", { autoAlpha: 0, scale: 0.9, y: 30, duration: 0.6 })
          .from(".wire", { drawSVG: "0%", duration: 1, stagger: 0.12, ease: "none" })
          .from(".agent-node-worker", { autoAlpha: 0, scale: 0.9, y: 30, duration: 0.6, stagger: 0.14 }, "-=0.7")
          .from(".wire-pulse", { autoAlpha: 0, duration: 0.3 });
      });
    },
    { scope: root },
  );

  return (
    <section
      ref={root}
      id="system"
      aria-labelledby="system-title"
      className="mx-auto max-w-[1240px] scroll-mt-14 px-5 py-24 md:px-8 md:py-36"
    >
      <SectionHeading
        id="system-title"
        index="02"
        label="System"
        title="One coordinator. Three workers. One closed case."
        intro="A coordinator plans. Three workers each own one job."
      />

      <div className="topology">
        <div className="agent-node-root mx-auto md:max-w-sm">
          <AgentNode
            icon={Workflow}
            code="A0"
            name="Coordinator Agent"
            body="Plans, assigns the work and settles disagreements."
          />
        </div>

        {/* Desktop: curved wires. Mobile uses the straight line above each worker instead. */}
        <svg aria-hidden="true" viewBox="0 0 1000 120" className="hidden h-auto w-full md:block">
          <defs>
            <linearGradient id="wire" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="120">
              <stop offset="0" stopColor="#19c9a6" />
              <stop offset="1" stopColor="#c8f53c" />
            </linearGradient>
          </defs>
          {workers.map((worker, i) => (
            <g key={worker.code}>
              <path className="wire" d={worker.path} fill="none" stroke="url(#wire)" strokeWidth="1.5" strokeOpacity="0.7" />
              <path
                className="wire-pulse animate-pulse-travel"
                d={worker.path}
                fill="none"
                stroke="#c8f53c"
                strokeWidth="4"
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray="0.06 1"
                strokeDashoffset="0.06"
                style={{ animationDelay: `${i * 0.9}s`, filter: "drop-shadow(0 0 6px #c8f53c)" }}
              />
            </g>
          ))}
        </svg>

        <div className="grid md:grid-cols-3 md:gap-6">
          {workers.map((worker) => (
            <div key={worker.code} className="agent-node-worker flex flex-col">
              <span aria-hidden="true" className="mx-auto h-9 w-px bg-gradient-to-b from-teal to-lime md:hidden" />
              <AgentNode icon={worker.icon} code={worker.code} name={worker.name} body={worker.body} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
