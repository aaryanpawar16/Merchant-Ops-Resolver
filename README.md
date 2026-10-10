# Merchant Ops Resolver

An autonomous multi-agent system that investigates, fixes, verifies and closes merchant operations issues such as a failed settlement. Give it one instruction, and four agents handle the case.

- `/` is the landing page.
- `/console` is the working product: run a case and watch the agents, trace, checkpoints and costs live.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000 and press **Try it now**.

For AI-written text, run [Ollama](https://ollama.com) with a model pulled (`ollama pull llama2`). It is optional: without it the console uses built-in wording and every decision is unchanged.

| Variable | Default | Purpose |
| --- | --- | --- |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | Where Ollama listens |
| `OLLAMA_MODEL` | `llama2` | Model used for narration |
| `RESOLVER_DATA_DIR` | `./.data` | Where memory and run history are saved |

## How it works

```
instruction -> Coordinator -> Investigation -> (Coordinator rules on conflicts)
                           -> Resolution (checkpointed, verifies against the real system)
                           -> Closure (knowledge base, merchant message, memory)
```

| Part | What it does | Code |
| --- | --- | --- |
| Agents | Coordinator, Investigation, Resolution, Closure | `lib/engine/agents.ts`, `lib/engine/run.ts` |
| Tools | The only way agents touch the simulated world | `lib/engine/tools.ts`, `lib/engine/world.ts` |
| neatlogs-style tracing | Every agent run, model call, tool call, retry and checkpoint is a span. Export any run as OTLP JSON | `lib/engine/runtime.ts`, `lib/engine/export.ts` |
| Entire-style checkpoints | Hash-linked checkpoints after each step. A failed step resumes from the last one instead of restarting. Memory of past cases lets a repeat case skip the full sweep | `lib/engine/checkpoints.ts` |
| cfo.ai-style economics | Cost per case from measured tool calls and tokens, a human baseline, and a monthly model | `lib/engine/economics.ts` |

Things worth trying in the console:

1. **Failed settlement**, then run it again. The first run of a new failure type sweeps every system. The second starts from the saved playbook and uses fewer calls.
2. **Break something** on. The first call to an external system times out. Resolution resumes from its checkpoint, skips finished steps, and retries a different way under the same idempotency key.
3. **Risk hold**. Two findings disagree and the Coordinator rules with a stated, auditable rule.
4. **Compliance hold**. Policy forbids changing compliance status, so the agents take the safe path and escalate to a human.

## API

| Route | Purpose |
| --- | --- |
| `POST /api/runs` | Start a case, streams events as server-sent events. Body: `{ instruction, chaos?, llm? }` |
| `GET /api/runs`, `GET /api/runs/:id` | Run history, and one stored run with all events |
| `GET /api/runs/:id/trace` | OTLP/JSON export of the trace |
| `GET /api/economics` | Measured unit costs across runs, plus the assumptions |
| `GET /api/memory`, `DELETE /api/memory?mode=reset\|clear` | Learned playbooks |
| `GET /api/status` | Whether the local model is reachable |

## What is real and what is simulated

Be upfront about this when presenting.

- **Real:** the agent orchestration, the policy checks, the checkpoint chain and its hash verification, resume after failure, memory-driven speedup, the verification loop, the streaming API, the trace data, the llama2 calls and their token counts.
- **Simulated:** the merchants, settlements, bank directory, KYC and risk data, and the bank, KYC and notification APIs. They live in `lib/engine/world.ts` and `lib/engine/tools.ts`. Tool latencies are artificial.
- **Not the real SDKs:** neatlogs, Entire and cfo.ai are modelled natively. The neatlogs SDK is Python, Entire is a git-based CLI for coding sessions, and cfo.ai is a hosted product, so none plugs into a TypeScript service directly. The OTLP export is the bridge for traces.
- **Assumptions:** prices, human handling time and monthly-model inputs in `lib/engine/economics.ts` are assumptions, labelled as such in the console.
- **The model never decides.** llama2 has no tool calling, so it only writes text: the ruling explanation and the merchant message. Decisions and every state change come from code.
