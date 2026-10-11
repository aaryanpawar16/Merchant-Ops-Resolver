import type { Metadata } from "next";
import { Console } from "@/components/console/Console";

export const metadata: Metadata = {
  title: "Case console | Merchant Ops Resolver",
  description: "Give the agents one instruction and watch them investigate, fix, verify and close a merchant operations case, with a live trace, checkpoints and unit costs.",
};

export default function ConsolePage() {
  return <Console />;
}
