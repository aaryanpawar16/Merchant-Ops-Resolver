"use client";

import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { useRef } from "react";
import { gsap, MOTION_OK, ScrollTrigger, useGSAP } from "@/lib/gsap";

// Owns smooth scrolling and the shared reveal for anything marked data-reveal.
export function SmoothScroll({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(MOTION_OK, () => {
        const lenis = new Lenis({ anchors: true, lerp: 0.075 });
        lenis.on("scroll", ScrollTrigger.update);
        const tick = (time: number) => lenis.raf(time * 1000);
        gsap.ticker.add(tick);
        gsap.ticker.lagSmoothing(0);

        gsap.set("[data-reveal]", { autoAlpha: 0, y: 44 });
        ScrollTrigger.batch("[data-reveal]", {
          start: "top 88%",
          once: true,
          onEnter: (targets) =>
            gsap.to(targets, { autoAlpha: 1, y: 0, duration: 0.9, ease: "power3.out", stagger: 0.09 }),
        });

        // Anything marked data-flow drifts into focus as it arrives and lifts away as it leaves,
        // tied to scroll position, so chapters hand over to each other instead of cutting.
        gsap.utils.toArray<HTMLElement>("[data-flow]").forEach((el) => {
          gsap.fromTo(
            el,
            { autoAlpha: 0, y: 70, filter: "blur(10px)" },
            {
              autoAlpha: 1,
              y: 0,
              filter: "blur(0px)",
              ease: "none",
              scrollTrigger: { trigger: el, start: "top 96%", end: "top 62%", scrub: 0.6 },
            },
          );
          gsap.fromTo(
            el,
            { autoAlpha: 1, y: 0 },
            {
              autoAlpha: 0,
              y: -50,
              ease: "none",
              immediateRender: false,
              scrollTrigger: { trigger: el, start: "bottom 26%", end: "bottom 4%", scrub: 0.6 },
            },
          );
        });

        return () => {
          gsap.ticker.remove(tick);
          lenis.destroy();
        };
      });

      // Child sections create their triggers first; sort so pin spacing is measured in page order.
      ScrollTrigger.sort();
      ScrollTrigger.refresh();
      document.fonts.ready.then(() => ScrollTrigger.refresh());
    },
    { scope: root },
  );

  return <div ref={root}>{children}</div>;
}
