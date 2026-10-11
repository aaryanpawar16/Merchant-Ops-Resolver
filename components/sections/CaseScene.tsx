"use client";

import { useRef, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { steps, type Node } from "@/lib/case";
import { caseLive, setCase } from "@/lib/caseStatus";
import { gsap, NO_PIN, PIN_OK, ScrollTrigger, useGSAP } from "@/lib/gsap";

const pad = (n: number) => String(n).padStart(2, "0");

// The core is fully assembled at step 05, when the fix is verified.
const repairAt = (index: number) => Math.min(1, index / 4);

function Chip({ id, label, active }: { id: Node; label: string; active: Node }) {
  const lit = active === id || (active === "all" && id !== "ops");
  return (
    <span
      className={`label rounded-[2px] border px-2 py-1.5 !text-[10px] !tracking-[0.1em] transition-all duration-500 ${
        lit
          ? "border-[var(--tone)] bg-white/5 text-[var(--tone)] shadow-[0_0_26px_-6px_var(--tone)]"
          : "border-line text-mute"
      }`}
    >
      {label}
    </span>
  );
}

function AgentGraph({ active }: { active: Node }) {
  return (
    <div className="flex flex-col items-center px-4 py-4">
      <Chip id="ops" label="Ops console" active={active} />
      <span aria-hidden="true" className="h-5 w-px bg-line" />
      <Chip id="coordinator" label="Coordinator" active={active} />
      <svg aria-hidden="true" viewBox="0 0 300 24" preserveAspectRatio="none" className="h-6 w-full max-w-md">
        <path
          d="M150 0 V12 M50 12 H250 M50 12 V24 M150 12 V24 M250 12 V24"
          fill="none"
          stroke="rgb(255 255 255 / 0.18)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="grid w-full max-w-md grid-cols-3 justify-items-center">
        <Chip id="investigation" label="Investigation" active={active} />
        <Chip id="resolution" label="Resolution" active={active} />
        <Chip id="closure" label="Closure" active={active} />
      </div>
    </div>
  );
}

// Desktop: the viewport pins and scrolling advances the case one step at a time.
// Small screens and reduced motion get the same steps as a plain list.
export function CaseScene() {
  const root = useRef<HTMLElement>(null);
  const current = useRef(0);
  const readout = useRef<HTMLSpanElement>(null);
  const [active, setActive] = useState(0);
  const step = steps[active];

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(PIN_OK, () => {
        const section = root.current;
        if (!section) return;
        section.dataset.mode = "pin";

        ScrollTrigger.create({
          trigger: ".case-pin",
          start: "top top",
          end: () => `+=${window.innerHeight * 3.2}`,
          pin: true,
          onUpdate: (self) => {
            const index = Math.min(steps.length - 1, Math.floor(self.progress * steps.length));
            gsap.set(".case-progress", { scaleX: self.progress });
            // The core is whole at the moment step 05 begins.
            const repair = gsap.utils.clamp(0, 1, (self.progress * steps.length) / 4);
            caseLive.repair = self.isActive ? repair : null;
            if (readout.current) readout.current.textContent = String(Math.round(repair * 100));
            if (index !== current.current) {
              // Step 05 is the payoff: the fix is confirmed against the real system.
              if (index === 4 && current.current < 4) {
                gsap
                  .timeline()
                  .fromTo(".verify-flash", { autoAlpha: 0, scale: 1.25 }, { autoAlpha: 1, scale: 1, duration: 0.35, ease: "power3.out" })
                  .fromTo(".verify-sweep", { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: "power3.inOut" }, 0)
                  .to(".verify-flash", { autoAlpha: 0, scale: 0.96, duration: 0.5, ease: "power2.in" }, 0.75);
              }
              current.current = index;
              setActive(index);
            }
            if (self.isActive) setCase(steps[index].hud, steps[index].tone, repairAt(index));
          },
        });

        return () => {
          caseLive.repair = null;
          delete section.dataset.mode;
        };
      });

      mm.add(NO_PIN, () => {
        gsap.utils.toArray<HTMLElement>(".case-item").forEach((item, i) => {
          ScrollTrigger.create({
            trigger: item,
            start: "top 60%",
            end: "bottom 60%",
            onToggle: (self) => {
              if (self.isActive) setCase(steps[i].hud, steps[i].tone, repairAt(i));
            },
          });
        });
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} id="case" aria-labelledby="case-title" className="group scroll-mt-14">
      <div className="mx-auto max-w-[1240px] px-5 pt-24 md:px-8 md:pt-36">
        <SectionHeading
          id="case-title"
          index="03"
          label="Case"
          title="One failed settlement, start to closed"
          intro="One instruction in. A verified fix and a full trace out."
        />
      </div>

      <div className="case-pin relative hidden h-svh group-data-[mode=pin]:block">
        <div
          aria-hidden="true"
          className="verify-flash pointer-events-none invisible absolute inset-0 z-10 flex flex-col items-center justify-center bg-void/70 backdrop-blur-md"
        >
          <p className="display text-[13vw] text-lime">Verified</p>
          <span className="verify-sweep h-1 w-[60vw] origin-left bg-lime" />
        </div>
        <div className="mx-auto grid h-full max-w-[1240px] grid-cols-[1fr_15rem_1fr] items-center gap-8 px-8 pt-16 pb-6">
          <div>
            <p className="label">
              Step <span className="tone">{pad(active + 1)}</span>
              <span className="mx-2 text-mute">/</span>
              {pad(steps.length)}
            </p>
            <div className="relative mt-4 h-[25rem]">
              {steps.map((item, i) => (
                <div
                  key={i}
                  aria-hidden={i !== active}
                  className={`absolute inset-0 transition-all duration-500 ease-out ${
                    i === active
                      ? "translate-y-0 opacity-100"
                      : `pointer-events-none opacity-0 ${i < active ? "-translate-y-10" : "translate-y-10"}`
                  }`}
                >
                  <p className="display outline-text text-[9rem] leading-none">{pad(i + 1)}</p>
                  <p className="label tone mt-5">{item.actor}</p>
                  <p className="display mt-4 text-[2rem] leading-[1.1] text-balance">{item.event}</p>
                </div>
              ))}
            </div>
            <div aria-hidden="true" className="relative mt-6 h-px bg-line">
              <span className="case-progress bg-tone absolute inset-0 origin-left scale-x-0" />
            </div>
          </div>

          {/* The 3D core assembles in this slot as the steps advance. */}
          <p aria-hidden="true" className="label self-end pb-28 text-center text-mute">
            Core integrity{" "}
            <span className="tone tabular-nums">
              <span ref={readout}>0</span>%
            </span>
          </p>

          <GlassCard solid>
            <div className="label flex items-center justify-between border-b border-line px-5 py-3.5">
              <span>Live run</span>
              <span className="text-mute">Timings from a real run</span>
            </div>
            <AgentGraph active={step.node} />
            <ol className="font-mono text-xs">
              {steps.map((item, i) => (
                <li
                  key={i}
                  className={`grid grid-cols-[1.5rem_6.5rem_1fr] gap-x-3 border-t border-line px-5 py-2 transition-all duration-500 ${
                    i <= active ? "opacity-100" : "translate-y-2 opacity-0"
                  }`}
                >
                  <span className="tone">{pad(i + 1)}</span>
                  <span className="text-mute">{item.actor}</span>
                  <span className={i === active ? "text-ink" : "text-mute"}>
                    {item.result}
                    <span className="block text-[11px] text-mute">{item.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
          </GlassCard>
        </div>
      </div>

      <ol className="mx-auto max-w-[1240px] space-y-4 px-5 pb-24 group-data-[mode=pin]:hidden md:px-8">
        {steps.map((item, i) => (
          <li key={i} className="case-item">
            <GlassCard data-reveal className="grid gap-x-6 gap-y-3 p-6 md:grid-cols-[5rem_1fr_12rem] md:p-8">
              <p className="display outline-text text-5xl">{pad(i + 1)}</p>
              <div>
                <p className="label tone">{item.actor}</p>
                <p className="display mt-3 text-xl leading-snug md:text-2xl">{item.event}</p>
              </div>
              <p className="font-mono text-xs leading-relaxed md:text-right">
                <span className="tone uppercase">{item.result}</span>
                <span className="block text-mute">{item.detail}</span>
              </p>
            </GlassCard>
          </li>
        ))}
        <li className="label text-mute">Timings from a real run</li>
      </ol>
    </section>
  );
}
