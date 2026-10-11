"use client";

import { useRef } from "react";
import { gsap, useGSAP } from "@/lib/gsap";

// Square reticle that trails the pointer and opens up over anything clickable.
export function Cursor() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)", () => {
      const el = root.current;
      if (!el) return;
      gsap.set(el, { xPercent: -50, yPercent: -50, autoAlpha: 0 });
      const x = gsap.quickTo(el, "x", { duration: 0.35, ease: "power3" });
      const y = gsap.quickTo(el, "y", { duration: 0.35, ease: "power3" });

      const onMove = (event: PointerEvent) => {
        x(event.clientX);
        y(event.clientY);
        gsap.to(el, { autoAlpha: 1, duration: 0.2, overwrite: "auto" });
        const target = event.target instanceof Element ? event.target.closest("a, button") : null;
        el.dataset.active = String(Boolean(target));
      };
      const onLeave = () => gsap.to(el, { autoAlpha: 0, duration: 0.2 });

      window.addEventListener("pointermove", onMove);
      document.documentElement.addEventListener("pointerleave", onLeave);
      return () => {
        window.removeEventListener("pointermove", onMove);
        document.documentElement.removeEventListener("pointerleave", onLeave);
      };
    });
  });

  return (
    <div ref={root} aria-hidden="true" className="cursor pointer-events-none invisible fixed top-0 left-0 z-[90]">
      <div className="cursor-ring size-7 border border-[var(--tone)]" />
    </div>
  );
}
