"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ScrollTrigger, useGSAP } from "@/lib/gsap";
import { isLinked, site } from "@/lib/site";

// The page is one story in five chapters. Each chapter starts at its first section.
const chapters = [
  { label: "Breaks", href: "#problem", start: "#top" },
  { label: "Assembles", href: "#system", start: "#interlude-assemble" },
  { label: "Resolves", href: "#case", start: "#case" },
  { label: "Proves", href: "#stack", start: "#interlude-prove" },
  { label: "Closes", href: "#outcome", start: "#outcome" },
];

export function Nav() {
  const root = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);

  useGSAP(() => {
    // A chapter is current once its first section has crossed the middle of the viewport.
    const update = () => {
      let current = 0;
      chapters.forEach((chapter, i) => {
        const el = document.querySelector(chapter.start);
        if (el && el.getBoundingClientRect().top <= window.innerHeight / 2) current = i;
      });
      setActive(current);
    };
    ScrollTrigger.create({ start: 0, end: "max", onUpdate: update, onRefresh: update });
  });

  return (
    <header ref={root} className="label fixed inset-x-0 top-0 z-40 border-b border-line bg-void/55 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1240px] items-center justify-between px-5 md:px-8">
        <a href="#top" className="flex items-center gap-3">
          <span aria-hidden="true" className="bg-tone size-2" />
          {site.name}
        </a>
        <nav aria-label="Chapters" className="hidden items-center md:flex">
          {chapters.map((chapter, i) => (
            <a
              key={chapter.href}
              href={chapter.href}
              aria-current={i === active ? "step" : undefined}
              className={`flex items-center gap-2 px-3.5 transition-colors duration-500 hover:text-ink ${
                i === active ? "text-ink" : "text-mute"
              }`}
            >
              <span className={i <= active ? "tone" : ""}>0{i + 1}</span>
              {chapter.label}
              <span
                aria-hidden="true"
                className={`bg-tone ml-1 h-px origin-left transition-all duration-700 ${i === active ? "w-8" : "w-0"}`}
              />
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {isLinked(site.links.github) && (
            <a
              href={site.links.github}
              target="_blank"
              rel="noreferrer"
              className="hidden rounded-[2px] border border-line px-3.5 py-2 transition-colors duration-200 hover:border-lime hover:text-lime sm:block"
            >
              GitHub
            </a>
          )}
          <Link
            href="/console"
            className="rounded-[2px] border border-lime bg-lime px-3.5 py-2 text-void transition-colors duration-200 hover:border-ink hover:bg-ink"
          >
            Try it now
          </Link>
        </div>
      </div>
      <span aria-hidden="true" className="nav-progress bg-tone absolute inset-x-0 bottom-[-1px] h-px origin-left scale-x-0" />
    </header>
  );
}
