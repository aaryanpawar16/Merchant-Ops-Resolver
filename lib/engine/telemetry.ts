import { trace, traceToolOpenAI, wrapOpenAI } from "neatlogs";

// neatlogs tracing. Everything here is a pass-through until NEATLOGS_API_KEY is set, so the app behaves
// identically with tracing off. The SDK itself is initialised once at startup in instrumentation.ts.
export const telemetryOn = () => Boolean(process.env.NEATLOGS_API_KEY);

type AttrValue = string | number | boolean;

// The part of an active span the engine uses.
export type TraceSpan = {
  setAttribute(key: string, value: AttrValue): unknown;
  spanContext(): { traceId: string };
};

const NOOP: TraceSpan = { setAttribute: () => undefined, spanContext: () => ({ traceId: "" }) };

export type TracedKind = "WORKFLOW" | "AGENT" | "CHAIN" | "RETRIEVER" | "GUARDRAIL";

// Runs `fn` inside a neatlogs span. Spans nest under whichever span is active, so the trace tree
// follows the call hierarchy. Errors are recorded on the span and rethrown by the SDK.
export function traced<T>(
  options: { name: string; kind: TracedKind; input?: unknown; attributes?: Record<string, AttrValue> },
  fn: (span: TraceSpan) => Promise<T>,
): Promise<T> {
  if (!telemetryOn()) return fn(NOOP);
  return trace(options, (span) => fn(span));
}

// A TOOL span that records the arguments as input and the return value as output.
export function tracedTool<R>(name: string, args: Record<string, AttrValue>, fn: () => Promise<R>): Promise<R> {
  if (!telemetryOn()) return fn();
  return traceToolOpenAI(name, fn)(args);
}

// Model calls are captured by wrapping the client once. This is the only instrumentation on them.
export function instrumentClient<T extends object>(client: T): T {
  return telemetryOn() ? wrapOpenAI(client) : client;
}
