"use client";

import Link from "next/link";
import { useRef } from "react";
import { gsap } from "@/lib/gsap";

type ButtonProps = {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
};

// Rectangular button that leans a few pixels toward the pointer.
export function Button({ href, children, variant = "primary" }: ButtonProps) {
  const ref = useRef<HTMLAnchorElement>(null);

  function onPointerMove(event: React.PointerEvent<HTMLAnchorElement>) {
    if (event.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = event.currentTarget.getBoundingClientRect();
    gsap.to(ref.current, {
      x: (event.clientX - rect.left - rect.width / 2) * 0.22,
      y: (event.clientY - rect.top - rect.height / 2) * 0.32,
      duration: 0.4,
      ease: "power3.out",
    });
  }

  function onPointerLeave() {
    gsap.to(ref.current, { x: 0, y: 0, duration: 0.7, ease: "elastic.out(1, 0.45)" });
  }

  const shared = {
    ref,
    href,
    onPointerMove,
    onPointerLeave,
    className: `label inline-flex items-center justify-between gap-4 rounded-[2px] border px-5 py-4 transition-colors duration-200 ${
      variant === "primary"
        ? "border-lime bg-lime text-void hover:border-ink hover:bg-ink"
        : "border-line bg-white/5 text-ink backdrop-blur hover:border-lime hover:text-lime"
    }`,
  };

  // Routes inside the app use client-side navigation. Anchors and external links stay plain anchors.
  return href.startsWith("/") ? <Link {...shared}>{children}</Link> : <a {...shared}>{children}</a>;
}
