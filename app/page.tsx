import { CaseScene } from "@/components/sections/CaseScene";
import { FinalCTA } from "@/components/sections/FinalCTA";
import { Footer } from "@/components/sections/Footer";
import { Hero } from "@/components/sections/Hero";
import { Interlude } from "@/components/sections/Interlude";
import { Marquee } from "@/components/sections/Marquee";
import { Nav } from "@/components/sections/Nav";
import { Outcome } from "@/components/sections/Outcome";
import { Problem } from "@/components/sections/Problem";
import { Stack } from "@/components/sections/Stack";
import { System } from "@/components/sections/System";
import { Backdrop } from "@/components/ui/Backdrop";
import { Cursor } from "@/components/ui/Cursor";
import { Hud } from "@/components/ui/Hud";
import { Preloader } from "@/components/ui/Preloader";
import { Scene3D } from "@/components/ui/Scene3D";
import { ScrollCue } from "@/components/ui/ScrollCue";
import { SmoothScroll } from "@/components/ui/SmoothScroll";
import { StatusZone } from "@/components/ui/StatusZone";

export default function Home() {
  return (
    <SmoothScroll>
      <Preloader />
      <Backdrop />
      <Scene3D />
      <Nav />
      <main>
        <StatusZone status="Settlement failed" tone="fault">
          <Hero />
          <Marquee />
          <Problem />
        </StatusZone>
        <StatusZone status="Agents assigned" tone="work">
          <Interlude id="interlude-assemble">One instruction. The agents take it from there.</Interlude>
          <System />
        </StatusZone>
        <CaseScene />
        <StatusZone status="Closed, verified" tone="ok">
          <Interlude id="interlude-prove">Every step leaves evidence.</Interlude>
          <Stack />
          <Outcome />
          <FinalCTA />
        </StatusZone>
      </main>
      <Footer />
      <Hud />
      <ScrollCue />
      <Cursor />
    </SmoothScroll>
  );
}
