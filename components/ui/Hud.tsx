"use client";

import { useEffect, useRef } from "react";
import { CASE_EVENT, type CaseStatus } from "@/lib/caseStatus";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";

// Fixed readout: live case status plus how far through the page the reader is.
export function Hud() {
  const status = useRef<HTMLSpanElement>(null);
  const percent = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const onStatus = (event: Event) => {
      const next = (event as CustomEvent<CaseStatus>).detail.status;
      if (!status.current) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        status.current.textContent = next;
        return;
      }
      gsap.to(status.current, {
        duration: 0.7,
        scrambleText: { text: next, chars: "upperCase", speed: 0.5 },
        overwrite: true,
      });
    };
    window.addEventListener(CASE_EVENT, onStatus);
    return () => window.removeEventListener(CASE_EVENT, onStatus);
  }, []);

  useGSAP(() => {
    ScrollTrigger.create({
      start: 0,
      end: "max",
      onUpdate: (self) => {
        if (percent.current) percent.current.textContent = String(Math.round(self.progress * 100)).padStart(3, "0");
        gsap.set(".nav-progress", { scaleX: self.progress });
      },
    });
  });

  return (
    <div
      role="status"
      className="label glass glass-solid fixed right-4 bottom-4 z-40 flex items-center gap-3 !rounded-[2px] px-3.5 py-2.5 md:right-6 md:bottom-6"
    >
      <span aria-hidden="true" className="bg-tone size-2 animate-blink" />
      <span className="hidden text-mute sm:inline">Case 48213</span>
      <span ref={status} className="tone min-w-[9.5rem]">
        Settlement failed
      </span>
      <span aria-hidden="true" className="border-l border-line pl-3 text-mute tabular-nums">
        <span ref={percent}>000</span>%
      </span>
    </div>
  );
}
