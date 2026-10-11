"use client";

import dynamic from "next/dynamic";

// three.js is loaded after the page is interactive so it never blocks first paint.
const Core3D = dynamic(() => import("@/components/ui/Core3D").then((mod) => mod.Core3D), { ssr: false });

export function Scene3D() {
  return <Core3D />;
}
