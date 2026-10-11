import type { Metadata } from "next";
import { EvalConsole } from "@/components/eval/EvalConsole";

export const metadata: Metadata = {
  title: "Scorecard | Merchant Ops Resolver",
  description: "A fixed benchmark of 42 labelled cases, including six attacks. Scores the agents on correct outcomes and on unsafe actions read from the world, with and without failures.",
};

export default function EvalPage() {
  return <EvalConsole />;
}
