"use client";

import { gsap } from "@/lib/gsap";

type GlassCardProps = React.HTMLAttributes<HTMLDivElement> & { solid?: boolean; tilt?: boolean };

// Glass panel with a spotlight that follows the pointer, and an optional 3D tilt.
export function GlassCard({ children, className = "", solid = false, tilt = false, ...rest }: GlassCardProps) {
  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    el.style.setProperty("--mx", `${x}px`);
    el.style.setProperty("--my", `${y}px`);

    if (!tilt || event.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.to(el, {
      rotationY: (x / rect.width - 0.5) * 7,
      rotationX: (y / rect.height - 0.5) * -7,
      transformPerspective: 900,
      duration: 0.4,
      ease: "power3.out",
    });
  }

  function onPointerLeave(event: React.PointerEvent<HTMLDivElement>) {
    if (tilt) gsap.to(event.currentTarget, { rotationX: 0, rotationY: 0, duration: 0.7, ease: "power3.out" });
  }

  return (
    <div
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className={`glass spot relative overflow-hidden ${solid ? "glass-solid" : ""} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
