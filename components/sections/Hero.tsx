"use client";

import { ArrowDown, ArrowRight } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/Button";
import { CaseCard } from "@/components/ui/CaseCard";
import { gsap, INTRO_DELAY, MOTION_OK, SplitText, useGSAP } from "@/lib/gsap";

const tags = ["neatlogs traced", "Entire checkpointed", "cfo.ai priced"];

export function Hero() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.set(".pre-hidden", { visibility: "visible" });

        SplitText.create(".hero-title", {
          type: "lines,words",
          mask: "lines",
          autoSplit: true,
          onSplit: (self) =>
            gsap.from(self.words, { yPercent: 115, duration: 1.1, ease: "power4.out", stagger: 0.05, delay: INTRO_DELAY }),
        });
        gsap.from(".hero-fade", { autoAlpha: 0, y: 26, duration: 0.9, ease: "power3.out", stagger: 0.1, delay: INTRO_DELAY + 0.55 });
        gsap.from(".hero-card", { autoAlpha: 0, y: 70, rotationX: -14, duration: 1.3, ease: "power3.out", delay: INTRO_DELAY + 0.35 });
        gsap.to(".hero-float", { y: -14, duration: 3.4, ease: "sine.inOut", yoyo: true, repeat: -1 });

        // The hero recedes as the story starts.
        gsap.to(".hero-inner", {
          yPercent: -10,
          scale: 0.95,
          autoAlpha: 0.15,
          ease: "none",
          scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true },
        });

        const tiltX = gsap.quickTo(".hero-tilt", "rotationX", { duration: 0.7, ease: "power3" });
        const tiltY = gsap.quickTo(".hero-tilt", "rotationY", { duration: 0.7, ease: "power3" });
        const onMove = (event: PointerEvent) => {
          tiltY((event.clientX / window.innerWidth - 0.5) * 14);
          tiltX((event.clientY / window.innerHeight - 0.5) * -10);
        };
        window.addEventListener("pointermove", onMove);
        return () => window.removeEventListener("pointermove", onMove);
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} id="top" aria-labelledby="hero-title" className="relative flex min-h-svh items-center pt-14">
      <div className="hero-inner mx-auto grid w-full max-w-[1240px] gap-14 px-5 py-16 md:px-8 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-7">
          <p className="hero-fade pre-hidden label flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="rounded-[2px] border border-ember/60 px-2 py-1 text-ember">Open research project</span>
            <span className="text-mute">Autonomous multi-agent operations</span>
          </p>
          <h1
            id="hero-title"
            className="hero-title pre-hidden display mt-8 text-[2.9rem] sm:text-7xl lg:text-[5.6rem]"
          >
            One instruction in. A failed settlement fixed, verified and closed.
          </h1>
          <p className="hero-fade pre-hidden mt-8 max-w-[54ch] text-lg leading-relaxed text-mute">
            An autonomous multi-agent system that investigates, fixes, verifies and closes merchant issues.
            Nobody opens five dashboards.
          </p>
          <div className="hero-fade pre-hidden mt-10 flex flex-col gap-3 sm:flex-row">
            <Button href="/console">
              Try it now
              <ArrowRight aria-hidden="true" className="size-4" />
            </Button>
            <Button href="#case" variant="secondary">
              Watch it resolve the case
              <ArrowDown aria-hidden="true" className="size-4" />
            </Button>
          </div>
          <ul className="hero-fade pre-hidden label mt-10 flex flex-wrap gap-2 text-mute">
            {tags.map((tag) => (
              <li
                key={tag}
                className="rounded-[2px] border border-line bg-white/5 px-2.5 py-1.5 backdrop-blur"
              >
                {tag}
              </li>
            ))}
          </ul>
        </div>

        <div className="hero-card pre-hidden self-center [perspective:1200px] lg:col-span-5">
          <div className="hero-float">
            <div className="hero-tilt [transform-style:preserve-3d]">
              <CaseCard state="open" />
            </div>
          </div>
        </div>
      </div>

    </section>
  );
}
