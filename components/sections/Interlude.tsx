"use client";

import { useRef } from "react";
import { gsap, MOTION_OK, SplitText, useGSAP } from "@/lib/gsap";

// A quiet full-screen beat between chapters: one sentence, the 3D core, nothing else.
export function Interlude({ id, children }: { id: string; children: string }) {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        SplitText.create(".interlude-line", {
          type: "words",
          // SplitText would put an aria-label on this <p>, which is not allowed on a paragraph. The words stay in the page as ordinary text, so screen readers still read them.
          aria: "none",
          autoSplit: true,
          onSplit: (self) =>
            gsap
              .timeline({
                scrollTrigger: { trigger: root.current, start: "top 55%", end: "bottom 45%", scrub: 0.6 },
              })
              .fromTo(self.words, { opacity: 0.1 }, { opacity: 1, ease: "none", stagger: 0.08, duration: 0.4 })
              .to(self.words, { opacity: 0, y: -30, ease: "none", stagger: 0.04, duration: 0.3 }, "+=0.25"),
        });
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} id={id} className="flex h-[110svh] items-end justify-center px-5 pb-[30svh] md:px-8">
      <p className="interlude-line display max-w-[20ch] text-center text-4xl text-balance sm:text-6xl lg:text-7xl">
        {children}
      </p>
    </section>
  );
}
