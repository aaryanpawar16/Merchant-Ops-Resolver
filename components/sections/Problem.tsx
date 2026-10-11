"use client";

import { useRef } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { gsap, MOTION_OK, PIN_OK, SplitText, useGSAP } from "@/lib/gsap";

const problems = [
  { title: "Manual firefighting", body: "Ops hop across dashboards, bank consoles and tickets by hand." },
  { title: "No memory", body: "The same failure gets investigated from scratch every time." },
  { title: "Fragmented ownership", body: "Payments, KYC, risk and support, with no single thread." },
  { title: "No verification", body: "Tools say what is wrong. Nobody confirms the fix worked." },
];

// Desktop: the four problems run sideways through a pinned viewport. Elsewhere they are a grid.
export function Problem() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(MOTION_OK, () => {
        // The statement lights up word by word as it is read.
        SplitText.create(".problem-statement", {
          type: "words",
          autoSplit: true,
          onSplit: (self) =>
            gsap.fromTo(
              self.words,
              { opacity: 0.14 },
              {
                opacity: 1,
                ease: "none",
                stagger: 0.08,
                scrollTrigger: { trigger: ".problem-statement", start: "top 78%", end: "bottom 45%", scrub: true },
              },
            ),
        });
      });

      mm.add(PIN_OK, () => {
        const section = root.current;
        const track = section?.querySelector<HTMLElement>(".problem-track");
        if (!section || !track) return;
        section.dataset.mode = "pin";
        const distance = () => track.scrollWidth - window.innerWidth;

        gsap.to(track, {
          x: () => -distance(),
          ease: "none",
          scrollTrigger: {
            trigger: ".problem-pin",
            start: "top top",
            end: () => `+=${distance()}`,
            pin: true,
            scrub: 0.6,
            invalidateOnRefresh: true,
          },
        });

        return () => {
          delete section.dataset.mode;
        };
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} id="problem" aria-labelledby="problem-title" className="group scroll-mt-14">
      <div className="mx-auto max-w-[1240px] px-5 pt-24 pb-16 md:px-8 md:pt-36 md:pb-24">
        <p className="label mb-8">
          <span className="tone">01</span>
          <span className="mx-2 text-mute">/</span>
          Problem
        </p>
        <h2 id="problem-title" className="problem-statement display max-w-[22ch] text-4xl sm:text-6xl lg:text-7xl">
          Merchant ops still runs on tab switching. Every failed settlement starts from zero.
        </h2>
      </div>

      <div className="problem-pin pb-24 group-data-[mode=pin]:flex group-data-[mode=pin]:h-svh group-data-[mode=pin]:items-center group-data-[mode=pin]:overflow-hidden group-data-[mode=pin]:pt-14 group-data-[mode=pin]:pb-0">
        <div className="problem-track mx-auto grid max-w-[1240px] gap-4 px-5 group-data-[mode=pin]:mx-0 group-data-[mode=pin]:flex group-data-[mode=pin]:w-max group-data-[mode=pin]:max-w-none group-data-[mode=pin]:items-stretch group-data-[mode=pin]:gap-6 group-data-[mode=pin]:px-[max(2rem,calc((100vw-1240px)/2+2rem))] md:grid-cols-2 md:px-8">
          {problems.map((problem, i) => (
            <GlassCard
              key={problem.title}
              tilt
              data-reveal
              className="flex flex-col justify-between p-7 group-data-[mode=pin]:h-[62vh] group-data-[mode=pin]:w-[34rem] md:p-10"
            >
              <p className="display text-7xl text-ember group-data-[mode=pin]:text-[11rem]">0{i + 1}</p>
              <div className="mt-8">
                <h3 className="display text-2xl md:text-4xl">{problem.title}</h3>
                <p className="mt-3 max-w-[46ch] leading-relaxed text-mute md:text-lg">{problem.body}</p>
              </div>
            </GlassCard>
          ))}
          <p
            aria-hidden="true"
            className="display hidden self-center pr-10 pl-16 text-[9rem] whitespace-nowrap text-ink [text-shadow:0_2px_30px_rgb(6_8_7/0.9)] group-data-[mode=pin]:block"
          >
            So we built a <span className="text-lime">teammate.</span>
          </p>
        </div>
      </div>
    </section>
  );
}
