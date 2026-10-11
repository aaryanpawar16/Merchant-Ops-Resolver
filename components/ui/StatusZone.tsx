"use client";

import { useRef } from "react";
import { setCase, type Tone } from "@/lib/caseStatus";
import { ScrollTrigger, useGSAP } from "@/lib/gsap";

// Sets the case status while this part of the page is on screen.
export function StatusZone({ status, tone, children }: { status: string; tone: Tone; children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    ScrollTrigger.create({
      trigger: root.current,
      start: "top 55%",
      end: "bottom 55%",
      onToggle: (self) => {
        if (self.isActive) setCase(status, tone);
      },
    });
  });

  return <div ref={root}>{children}</div>;
}
