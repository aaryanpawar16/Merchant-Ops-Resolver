import Link from "next/link";
import { isLinked, site } from "@/lib/site";

// Links that are still placeholders are left out, so the footer never has a dead link.
const links = [
  { label: "Case console", href: "/console", internal: true },
  { label: "Batch upload", href: "/console/batch", internal: true },
  { label: "Scorecard", href: "/eval", internal: true },
  { label: "GitHub", href: site.links.github, internal: false },
  { label: "Demo video", href: site.links.demo, internal: false },
  { label: `${site.hackathon} posts`, href: site.links.posts, internal: false },
  { label: "Business plan", href: site.links.plan, internal: false },
].filter((link) => link.internal || isLinked(link.href));

export function Footer() {
  return (
    <footer className="label border-t border-line bg-void/60 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-6 px-5 py-10 md:flex-row md:items-center md:justify-between md:px-8">
        <p>
          {site.name}
          <span className="mt-1.5 block text-mute">Built for {site.hackathon}</span>
        </p>
        <nav aria-label="Project links">
          <ul className="flex flex-wrap gap-x-7 gap-y-3 text-mute">
            {links.map((link) => (
              <li key={link.label}>
                {link.internal ? (
                  <Link href={link.href} className="transition-colors duration-200 hover:text-lime">
                    {link.label}
                  </Link>
                ) : (
                  <a href={link.href} target="_blank" rel="noreferrer" className="transition-colors duration-200 hover:text-lime">
                    {link.label}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <p className="mx-auto max-w-[1240px] px-5 pb-24 text-mute md:px-8 md:pb-10">
        Traced with neatlogs. Checkpointed with Entire. Priced with cfo.ai.
      </p>
    </footer>
  );
}
