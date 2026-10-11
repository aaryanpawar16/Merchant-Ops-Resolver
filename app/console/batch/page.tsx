import type { Metadata } from "next";
import { BatchConsole } from "@/components/batch/BatchConsole";

export const metadata: Metadata = {
  title: "Batch upload | Merchant Ops Resolver",
  description: "Upload a CSV, TSV or JSON file of failed and held settlements. The agents resolve what policy allows, escalate the rest with a plan, and learn as they go.",
};

export default function BatchPage() {
  return <BatchConsole />;
}
