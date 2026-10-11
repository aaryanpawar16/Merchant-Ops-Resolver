"use client";

import { useRef } from "react";
import { gsap, MOTION_OK, useGSAP } from "@/lib/gsap";

// Boot sequence: the failed case arrives, a counter runs, then the curtain lifts on the hero.
export function Preloader() {
  const root = useRef<HTMLDivElement>(null);
  const count = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const counter = { value: 0 };
        gsap
          .timeline({ onComplete: () => gsap.set(root.current, { display: "none" }) })
          .from(".pre-line", { autoAlpha: 0, y: 12, duration: 0.35, stagger: 0.16 }, 0.05)
          .to(".pre-bar", { scaleX: 1, duration: 1.15, ease: "power2.inOut" }, 0)
          .to(
            counter,
            {
              value: 100,
              duration: 1.15,
              ease: "power2.inOut",
              onUpdate: () => {
                if (count.current) count.current.textContent = String(Math.round(counter.value)).padStart(3, "0");
              },
            },
            0,
          )
          .to(".pre-inner", { autoAlpha: 0, y: -24, duration: 0.3, ease: "power2.in" }, 1.2)
          .to(root.current, { yPercent: -100, duration: 0.8, ease: "power4.inOut" }, 1.35);
      });
    },
    { scope: root },
  );

  return (
    <div ref={root} aria-hidden="true" className="preloader fixed inset-0 z-[100] bg-void">
      <div className="pre-inner mx-auto flex h-full max-w-[1240px] flex-col justify-between px-5 py-8 md:px-8">
        <p className="label flex items-center gap-3">
          <span className="size-2 animate-blink bg-ember" />
          Merchant Ops Resolver
        </p>
        <div className="flex flex-col justify-between gap-10 md:flex-row md:items-end">
          <div className="label space-y-2.5">
            <p className="pre-line text-mute">Incoming case</p>
            <p className="pre-line">txn 48213 / Sharma Kirana</p>
            <p className="pre-line text-ember">Settlement failed</p>
          </div>
          <p className="display text-[26vw] leading-[0.8] tabular-nums md:text-[13rem]">
            <span ref={count}>000</span>
          </p>
        </div>
        <span className="pre-bar absolute inset-x-0 bottom-0 h-1 origin-left scale-x-0 bg-ember" />
      </div>
    </div>
  );
}
