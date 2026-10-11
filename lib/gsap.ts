"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText, ScrambleTextPlugin, DrawSVGPlugin);

export const MOTION_OK = "(prefers-reduced-motion: no-preference)";
export const PIN_OK = "(min-width: 1024px) and (min-height: 680px) and (prefers-reduced-motion: no-preference)";
export const NO_PIN = "(max-width: 1023px), (max-height: 679px), (prefers-reduced-motion: reduce)";

export { gsap, ScrollTrigger, SplitText, useGSAP };

// Seconds the boot sequence takes before the hero starts animating. Zero under reduced motion.
export const INTRO_DELAY = 1.55;
