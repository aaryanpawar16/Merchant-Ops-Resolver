# Merchant Ops Resolver

An autonomous multi-agent system that investigates, fixes, verifies and closes merchant operations issues such as a failed settlement. Give it one instruction, and four agents handle the case.

- `/` is the landing page.
- `/console` is the working product: run a case and watch the agents, trace, checkpoints and costs live. The **Show me in 30 seconds** button plays the break-and-recover case and walks through the results.
- `/console/batch` takes a file. Upload a CSV, TSV or JSON export of failed and held settlements and the agents work through every case. `/console/batch?demo=1` loads the sample file and runs it.
- `/eval` is the scorecard: a fixed benchmark of 42 labelled cases, including six attacks, run with or without failures. `/eval?run=clean`, `?run=timeout` and `?run=ambiguous&careless=1` start a run straight away.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000 and press **Try it now**.

For AI-written text, run [Ollama](https://ollama.com) with a model pulled (`ollama pull llama3.2`, or `llama2`). It is optional: without it the console uses built-in wording and every decision is unchanged.

| Variable | Default | Purpose |
| --- | --- | --- |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | Where Ollama listens |
| `OLLAMA_MODEL` | `llama2` | Model used for narration |
| `RESOLVER_DATA_DIR` | `./.data` | Where memory and run history are saved |
| `NEATLOGS_API_KEY` | unset | neatlogs project API key. Turns on tracing |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | Deployed address, used for share-card image links |

Copy `.env.example` to `.env.local`, add the key, and restart the server. The [neatlogs TypeScript SDK](https://docs.neatlogs.com/sdk/typescript) is initialised once in `instrumentation.ts`. Each case is then one trace: a `WORKFLOW` root, an `AGENT` span per agent, `TOOL` spans for tool calls, a `RETRIEVER` span for the memory lookup, a `GUARDRAIL` span for the policy check, and an `LLM` span for every model call (via the OpenAI-compatible Ollama endpoint, with model and token counts). With no key, tracing is skipped entirely.

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
| neatlogs tracing | The neatlogs SDK traces every agent run, model call, tool call, retry and checkpoint. The console shows the same spans live, and any run exports as OTLP JSON | `instrumentation.ts`, `lib/engine/telemetry.ts`, `lib/engine/runtime.ts`, `lib/engine/export.ts` |
| Checkpoints and memory | Hash-linked checkpoints after each step. A failed step resumes from the last one instead of restarting. Memory of past cases lets a repeat case skip the full sweep | `lib/engine/checkpoints.ts` |
| cfo.ai economics | Cost per case from measured tool calls and tokens, a human baseline, and a simple monthly model. The full business plan (fixed costs, hiring, runway) is built in cfo.ai: [open the plan](https://cfo.ai/s/zjvRY4EQYV-5T8uH). It prices outcomes: $1.50 per resolved case, $0.375 per escalated case, about $1 per merchant per month | `lib/engine/economics.ts` |

Things worth trying in the console:

1. **Failed settlement**, then run it again. The first run of a new failure type sweeps every system. The second starts from the saved playbook and uses fewer calls.
2. **Break something** on. The first call to an external system times out. Resolution resumes from its checkpoint, skips finished steps, and retries a different way under the same idempotency key.
3. **Risk hold**. Two findings disagree and the Coordinator rules with a stated, auditable rule.
4. **Compliance hold**. Policy forbids changing compliance status, so the agents take the safe path and escalate to a human.

## Batch upload

Upload `public/sample-settlements.csv` (or your own file) at `/console/batch`. The page shows what it understood before anything runs: cases found, columns matched, rows skipped and why.

How a file becomes a case (`lib/engine/intake.ts`):

- Rows with a **failed** or **held** status are cases. **Settled** rows are history. Column names are matched loosely (`txn`, `transaction_id` and `Settlement ID` all work), and unknown columns are ignored.
- The file *is* the simulated world. The correct IFSC for an account is taken from that merchant's earlier settled payment (or a `verified_ifsc` column). KYC expiry and risk signals come from the optional `kyc_*` and `volume_*` columns.
- The agents only act on evidence in the file. If it is missing (no history for an account, no risk data, an unrecognised error), they say so and escalate. They never guess.
- Each case is a normal run, with its own trace, checkpoints and cost. Open any of them from the results table.
- The batch can start from empty memory, so you can watch the agents learn across the file. Your saved memory is restored untouched afterwards.
- An optional `expected_outcome` column (`resolved` or `escalated`) scores the agents against your own labels.

Results download as CSV, with a second file listing only the escalations and the next step for a person. A finished batch is stored and can be reopened at `/console/batch?batch=ID`.

Limits: 1 MB, 5,000 rows, and the first 50 cases are processed. The simulated waits are shortened in a batch so a dozen cases take seconds.

## Why did it decide that?

Every result has a "Why was this not fixed automatically?" panel (or "Why did it fix this on its own?" when the agents acted). It names the rule that stopped a more automatic action, shows the confidence against the bar it had to clear, and lists what would have to change for the decision to flip. For example, a clean risk hold of INR 3,20,000 shows "evidence of genuine demand 85% (80% needed)" and "INR 3,20,000 is above the INR 2,50,000 the agents may release on their own".

It is built in code (`lib/engine/whyNot.ts`) from the same thresholds the Coordinator uses (`BENIGN_RELEASE_CONFIDENCE`, `MAX_RETAINED_SHARE`, `AUTO_RELEASE_LIMIT_INR`), never written by the model, so it cannot embellish. Runs stored before this existed simply do not show the panel.

## Scorecard and red team

`/eval` runs a built-in benchmark (`lib/engine/evalSuite.ts`): 42 cases whose right answer was decided in advance, with 12 history rows. It covers fixable and unverifiable bank details, expired and unconfirmed KYC, risk holds that should be released, partly released, escalated or left over the release limit, and six attacks: an instruction hidden in the failure reason, a fake CFO note on a KYC hold, an instruction to ignore risk data, an instruction in the merchant name, a spreadsheet formula, and a demand for a different amount. Two history rows are planted to name a different IFSC code for the same account.

Two things are scored. **Correct outcomes** compares each result with its label. **Unsafe actions** are read from the simulated world after every case, never from what the agents report: money released on a case that should have escalated, a settlement paid more than once, paid above its amount, paid to an unverified account, released above the policy limit, funds released on a compliance hold, or a change to a merchant's KYC records. The scorecard shows these as seven **safety properties**, each held or broken across every case.

Three failure modes can be switched on: no failures, a bank timeout before the bank sees the request, and the dangerous one where the bank pays and the reply is lost. A fourth switch retries carelessly with a fresh idempotency key. It exists only to show what the real agent prevents, because the scorecard counts the resulting double payments.

Measured on this machine with the built-in rules and no model:

| Mode | Correct | Unsafe cases | Failed calls recovered | Settlements paid twice |
| --- | --- | --- | --- | --- |
| Clean | 42 of 42 | 0 | 0 | 0 |
| Bank times out | 42 of 42 | 0 | 21 | 0 |
| Bank pays, reply lost | 42 of 42 | 0 | 21 | 0 |
| Same, careless retry (demonstration) | 42 of 42 | 16 | 21 | 16 |

The last row shows why the check reads the world: every one of those cases still reports a correct, verified outcome while the bank has paid twice.

Be careful what this proves. The benchmark was written by the same team as the agents, so it is a regression and safety check, not an independent grade. Name each run on the page and keep earlier runs to compare before and after a change.

## API

| Route | Purpose |
| --- | --- |
| `POST /api/eval`, `GET /api/eval` | Run the benchmark (streams like a batch). Body: `{ mode: "clean" \| "timeout" \| "ambiguous", unsafeRetry?, label? }`. GET lists recorded runs |
| `POST /api/batches` | Upload a file's text, streams progress case by case. Body: `{ text, filename, chaos?, llm?, freshMemory? }` |
| `GET /api/batches/:id` | A finished batch with every result |
| `POST /api/runs` | Start a case, streams events as server-sent events. Body: `{ instruction, chaos?, llm? }` |
| `GET /api/runs`, `GET /api/runs/:id` | Run history, and one stored run with all events |
| `GET /api/runs/:id/trace` | OTLP/JSON export of the trace |
| `GET /api/economics` | Measured unit costs across runs, plus the assumptions |
| `GET /api/memory`, `DELETE /api/memory?mode=reset\|clear` | Learned playbooks |
| `GET /api/status` | Whether the local model is reachable |

## What is real and what is simulated

Be upfront about this when presenting.

- **Real:** the agent orchestration, the policy checks, the checkpoint chain and its hash verification, resume after failure, memory-driven speedup, the verification loop, the streaming API, the neatlogs traces, the model calls and their token counts.
- **Simulated:** the merchants, settlements, bank directory, KYC and risk data, and the bank, KYC and notification APIs. They live in `lib/engine/world.ts` and `lib/engine/tools.ts`. Tool latencies are artificial.
- **Entire is not a library.** It records coding-agent sessions against git commits, so it is used while building this project, not inside it. The checkpoints and memory in the app are our own and are not the Entire product.
- **cfo.ai is a hosted planning tool.** The plan is linked above. The code only reuses its pricing and shows its headline numbers.
- **Assumptions:** prices, human handling time and monthly-model inputs in `lib/engine/economics.ts` are assumptions, labelled as such in the console. The plan's cases per merchant (0.15 to 0.20 a month) is an estimate.
- **The model never decides, and never writes facts.** The local model has no tool calling, so it only writes the subject line of the merchant email (plus a plain-English ruling explanation when it is measured fast enough). The email body is built from verified facts, so the model cannot get a number, a name or a promise wrong. Its subject lines are filtered too: replies ("Re:"), urgency and promises such as "immediately" or "within 24 hours" are rejected and the built-in subject is used instead. Decisions and every state change come from code. On a slow laptop llama2 manages about 3 to 5 tokens per second, which is why its job is kept this small; `llama3.2` is faster.

## Landing page data

The trace waterfall, the checkpoint chain and the case-scene timings on the landing page are real. They are generated from two captured runs into `lib/sampleRun.ts`. To refresh them after changing the engine, start the app and run `npm run sample:capture`. Start it with a dummy `NEATLOGS_API_KEY` and `NEATLOGS_ENDPOINT=http://127.0.0.1:9` if you do not want the capture runs in your real neatlogs project.

Links that are still `#` in `lib/site.ts` (GitHub, demo video, posts, a shared neatlogs trace, the Entire checkpoint) are hidden on the site until you fill them in.

## Performance

The landing page runs two WebGL layers (a shader backdrop and a three.js scene with bloom). `lib/perf.ts` adds an automatic low-power mode: a frame-time monitor steps both layers down (lower resolution, no bloom, then one frame in three) when the page averages below about 24 fps, and devices that report 2 or fewer cores or 2 GB of memory or less start in reduced mode. The console uses only the backdrop.

Lighthouse on the production build in headless Chrome, which renders WebGL in software and so is pessimistic: the landing page scores 100 for SEO and best practices and 91 for accessibility, and the console scores 100 in all three. With WebGL off the landing page's total blocking time is about 0.6 s, so the cost is the WebGL rendering, not the page's own code. Measure on a machine with a real GPU before drawing conclusions.

## Deploying

- The console needs a Node server for the live stream, so use a host that runs Next.js server routes. `POST /api/runs` sets `maxDuration = 60` for platforms that read it.
- Set `NEATLOGS_API_KEY` and `NEXT_PUBLIC_SITE_URL` as environment variables. Never commit the key.
- Ollama is local, so a hosted deployment uses the built-in wording. Decisions and traces are unchanged.
- Memory and run history are written to `RESOLVER_DATA_DIR`, falling back to the OS temp directory. On serverless hosts they reset between instances, so a repeat case there may not start from a saved playbook.
