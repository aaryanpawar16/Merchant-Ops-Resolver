"use client";

import { useEffect, useState } from "react";

// Appears whenever the reader pauses, and steps aside the moment they move again.
export function ScrollCue() {
  const [visible, setVisible] = useState(false);
  const [atTop, setAtTop] = useState(true);

  useEffect(() => {
    let timer = window.setTimeout(() => setVisible(true), 3200);
    const onScroll = () => {
      setVisible(false);
      setAtTop(window.scrollY < 80);
      window.clearTimeout(timer);
      const nearEnd = window.scrollY + window.innerHeight > document.documentElement.scrollHeight - 400;
      if (!nearEnd) timer = window.setTimeout(() => setVisible(true), 2200);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <p
      aria-hidden="true"
      className={`label pointer-events-none fixed inset-x-0 bottom-7 z-30 hidden flex-col items-center gap-3 text-mute transition-all duration-700 md:flex ${
        visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
      }`}
    >
      {atTop ? "Scroll to resolve case 48213" : "Keep going"}
      <span className="relative h-9 w-px overflow-hidden bg-line">
        <span className="bg-tone absolute inset-x-0 top-0 h-3 animate-cue" />
      </span>
    </p>
  );
}
