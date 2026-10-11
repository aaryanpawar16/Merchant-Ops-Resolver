import { ArrowLeft } from "lucide-react";
import Link from "next/link";

const views = [
  { id: "single", href: "/console", label: "Single case" },
  { id: "batch", href: "/console/batch", label: "Batch upload" },
  { id: "eval", href: "/eval", label: "Scorecard" },
] as const;

// The top bar shared by every console view. `children` is the live status shown on the right.
export function ConsoleNav({ active, children }: { active: "single" | "batch" | "eval"; children?: React.ReactNode }) {
  return (
    <header className="label fixed inset-x-0 top-0 z-40 border-b border-line bg-void/55 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1360px] items-center justify-between gap-3 px-5 md:px-8">
        <Link href="/" aria-label="Back to the landing page" className="flex items-center gap-3 transition-colors hover:text-lime">
          <ArrowLeft aria-hidden="true" className="size-4" />
          <span aria-hidden="true" className="bg-tone size-2" />
          <span className="hidden lg:inline">Merchant Ops Resolver</span>
        </Link>

        <nav aria-label="Console views" className="flex items-center">
          {views.map((view) => (
            <Link
              key={view.id}
              href={view.href}
              aria-current={active === view.id ? "page" : undefined}
              className={`px-2 py-4 transition-colors sm:px-3 md:px-4 ${active === view.id ? "text-lime" : "text-mute hover:text-ink"}`}
            >
              {view.label}
            </Link>
          ))}
        </nav>

        <span className="hidden items-center gap-3 tabular-nums sm:flex">{children}</span>
      </div>
    </header>
  );
}
