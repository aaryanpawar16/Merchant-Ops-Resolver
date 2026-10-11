"use client";

import { ArrowRight, ArrowUpRight } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/Button";
import { CaseCard } from "@/components/ui/CaseCard";
import { gsap, MOTION_OK, SplitText, useGSAP } from "@/lib/gsap";
import { isLinked, site } from "@/lib/site";

export function FinalCTA() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        SplitText.create(".cta-title", {
          type: "lines,words",
          mask: "lines",
          autoSplit: true,
          onSplit: (self) =>
            gsap.from(self.words, {
              yPercent: 115,
              duration: 1,
              ease: "power4.out",
              stagger: 0.05,
              scrollTrigger: { trigger: ".cta-title", start: "top 82%" },
            }),
        });
        SplitText.create(".wordmark", {
          type: "chars",
          autoSplit: true,
          onSplit: (self) =>
            gsap.from(self.chars, {
              yPercent: 100,
              ease: "none",
              stagger: 0.06,
              scrollTrigger: { trigger: ".wordmark", start: "top bottom", end: "bottom bottom", scrub: 0.6 },
            }),
        });
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} id="closing" aria-labelledby="cta-title" className="relative">
      <div className="mx-auto grid max-w-[1240px] items-center gap-14 px-5 py-28 md:px-8 md:py-44 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-7">
          <p data-reveal className="label mb-7 text-lime">
            Case 48213 closed
          </p>
          <h2 id="cta-title" className="cta-title display text-5xl sm:text-7xl lg:text-[6rem]">
            Not a chatbot. <span className="text-lime">A teammate that finishes the job.</span>
          </h2>
          <div data-reveal className="mt-12 flex flex-col gap-3 sm:flex-row">
            <Button href="/console">
              Try it now
              <ArrowRight aria-hidden="true" className="size-4" />
            </Button>
            {isLinked(site.links.github) && (
              <Button href={site.links.github} variant="secondary">
                See it on GitHub
                <ArrowUpRight aria-hidden="true" className="size-4" />
              </Button>
            )}
            {isLinked(site.links.demo) && (
              <Button href={site.links.demo} variant="secondary">
                Watch the demo
                <ArrowUpRight aria-hidden="true" className="size-4" />
              </Button>
            )}
          </div>
        </div>
        <div data-reveal className="lg:col-span-5">
          <CaseCard state="resolved" />
        </div>
      </div>
      <p
        aria-hidden="true"
        className="wordmark display overflow-hidden text-center text-[21.5vw] leading-[0.8] text-lime/90 select-none"
      >
        Resolver
      </p>
    </section>
  );
}
