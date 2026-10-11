import { MODEL } from "@/lib/engine/ollama";
import type { Attr, Span, StoredRun } from "@/lib/engine/types";

// Exports a run as OpenTelemetry (OTLP/JSON) spans, so any OTel-compatible trace viewer can open it.
type OtlpValue = { stringValue: string } | { intValue: string } | { doubleValue: number } | { boolValue: boolean };

function value(v: Attr): OtlpValue {
  if (typeof v === "boolean") return { boolValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { intValue: String(v) } : { doubleValue: v };
  return { stringValue: v };
}

function attributes(span: Span) {
  const attrs: Record<string, Attr> = { "agent.id": span.agent, "span.kind.resolver": span.kind, ...span.attrs };
  if (span.kind === "llm") {
    attrs["gen_ai.system"] = "ollama";
    attrs["gen_ai.request.model"] = MODEL;
  }
  if (span.tokensIn !== undefined) attrs["gen_ai.usage.input_tokens"] = span.tokensIn;
  if (span.tokensOut !== undefined) attrs["gen_ai.usage.output_tokens"] = span.tokensOut;
  if (span.costUsd !== undefined) attrs["cost.usd"] = span.costUsd;
  return Object.entries(attrs).map(([key, v]) => ({ key, value: value(v) }));
}

export function toOtlp(run: StoredRun) {
  // Nanosecond timestamps exceed Number precision, so build them as digit strings.
  const startMs = new Date(run.meta.startedAt).getTime();
  const ns = (ms: number) => `${startMs + Math.round(ms)}000000`;

  // The last event for a span id is its final state.
  const final = new Map<string, Span>();
  for (const event of run.events) if (event.type === "span.start" || event.type === "span.end") final.set(event.span.id, event.span);

  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "merchant-ops-resolver" } },
            { key: "run.id", value: { stringValue: run.meta.id } },
            { key: "run.instruction", value: { stringValue: run.meta.instruction } },
          ],
        },
        scopeSpans: [
          {
            scope: { name: "merchant-ops-resolver.engine", version: "0.1.0" },
            spans: [...final.values()].map((span) => ({
              traceId: run.meta.traceId,
              spanId: span.id,
              ...(span.parentId ? { parentSpanId: span.parentId } : {}),
              name: span.name,
              kind: 1,
              startTimeUnixNano: ns(span.startMs),
              endTimeUnixNano: ns(span.endMs ?? span.startMs),
              attributes: attributes(span),
              status: { code: span.status === "error" ? 2 : 1 },
            })),
          },
        ],
      },
    ],
  };
}
