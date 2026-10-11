"use client";

import { useRef } from "react";
import { gsap, MOTION_OK, ScrollTrigger, useGSAP } from "@/lib/gsap";

const words = ["Investigates", "Fixes", "Verifies", "Documents", "Closes", "Not a chatbot"];

function Row({ hidden = false }: { hidden?: boolean }) {
  return (
    <ul aria-hidden={hidden} className="flex shrink-0 items-center">
      {words.map((word, i) => (
        <li key={word} className="flex items-center">
          <span className={`display px-8 text-5xl md:text-8xl ${i % 2 ? "tone" : "text-ink"}`}>{word}</span>
          <span aria-hidden="true" className="bg-tone size-3" />
        </li>
      ))}
    </ul>
  );
}

// The band drifts on its own, then speeds up, reverses and leans with scroll velocity.
export function Marquee() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const loop = gsap.to(".marquee-track", { xPercent: -50, duration: 32, ease: "none", repeat: -1 });
        const skew = gsap.quickTo(".marquee-track", "skewX", { duration: 0.5, ease: "power3" });
        let target = 1;
        let current = 1;
        let direction = 1;

        ScrollTrigger.create({
          trigger: root.current,
          start: "top bottom",
          end: "bottom top",
          onUpdate: (self) => {
            const velocity = self.getVelocity();
            direction = velocity < 0 ? -1 : 1;
            target = direction * (1 + Math.min(Math.abs(velocity) / 220, 8));
            skew(gsap.utils.clamp(-10, 10, velocity / -260));
          },
        });

        const tick = () => {
          target += (direction - target) * 0.06;
          current += (target - current) * 0.12;
          loop.timeScale(current);
          if (Math.abs(target - direction) < 0.05) skew(0);
        };
        gsap.ticker.add(tick);
        return () => gsap.ticker.remove(tick);
      });
    },
    { scope: root },
  );

  return (
    <div ref={root} className="overflow-hidden border-y border-line bg-void/75 py-8 backdrop-blur-md">
      <div className="marquee-track flex w-max">
        <Row />
        <Row hidden />
      </div>
    </div>
  );
}
