# neatHack submission: Merchant Ops Resolver

Fill every `TODO` before submitting. Nothing here should be invented: each link must point to something that exists.

## What it is

A team of four agents (Coordinator, Investigation, Resolution, Closure) that takes one instruction about a failed or held merchant settlement, finds the cause, fixes it within policy, verifies the fix, and writes to the merchant. Decisions and every state change are made in code. A small local model only writes the subject line of the email.

Differentiators:

- **Safe under failure.** Every external call carries one idempotency key across retries. A run resumes from a hash-linked checkpoint after a failed call, including the case where the bank paid and the reply was lost.
- **Measured, not claimed.** `/eval` runs 42 labelled cases with six attacks and reads unsafe actions from the world, not from the agents.
- **Bring your own data.** `/console/batch` takes a CSV, TSV or JSON export and processes every case, with evidence for each result and a separate list of escalations.
- **Learns across cases.** Playbooks of the minimum evidence needed per failure pattern are reused, which cuts tool calls.

## Links

| Item | Link |
| --- | --- |
| Public repository | https://github.com/aaryanpawar16/Merchant-Ops-Resolver |
| Demo video | TODO |
| #neatHack posts | TODO |
| neatlogs shared trace (a run where a call failed and the agent recovered) | TODO |
| neatlogs before/after traces | TODO |
| Entire checkpoint | https://entire.io/gh/aaryanpawar16/Merchant-Ops-Resolver/commit/102712c906c846377e331764777a03b42dabff00 |
| cfo.ai business plan | https://cfo.ai/s/zjvRY4EQYV-5T8uH |

## Tools used

- **neatlogs** traces every run: a workflow span per case, an agent span per agent, tool spans for each call, guardrail spans for policy checks. Enable with `NEATLOGS_API_KEY` (see `.env.example`).
- **Entire** records coding sessions against git commits. It was enabled part-way through the build: the earlier session was imported into Entire (66 turns, not tied to a commit), and the sessions after that are linked to commits through `Entire-Checkpoint` trailers.
- **cfo.ai** produced the outcome-based pricing and runway plan. The console reuses its pricing and shows measured unit costs next to it (`/api/economics`).

## Run it

```bash
npm install
cp .env.example .env   # optional: add NEATLOGS_API_KEY, set OLLAMA_MODEL
npm run dev
```

Open `/console` for one case, `/console/batch?demo=1` for the sample file, `/eval` for the scorecard. The full instructions are in `README.md`.

## Evidence of the agent working

Measured with the built-in rules and no model. The benchmark was written by the same team as the agents, so this is a regression and safety check, not an independent grade.

| Mode | Correct | Unsafe cases | Failed calls recovered |
| --- | --- | --- | --- |
| Clean | 42 of 42 | 0 | 0 |
| Bank times out | 42 of 42 | 0 | 21 |
| Bank pays, reply lost | 42 of 42 | 0 | 21 |
| Same, careless retry (demonstration only) | 42 of 42 | 16 | 21 |

The last row is a deliberate demonstration: with a fresh idempotency key on each retry, 16 settlements are paid twice while every case still reports success. It is switched on only by the `Retry carelessly` option and is not how the Resolver works.

### Reproduce it

Start the app (`npm run dev`), then either open a link, which starts the run straight away, or call the API:

| Mode | Page | API body for `POST /api/eval` |
| --- | --- | --- |
| Clean | `/eval?run=clean` | `{"mode":"clean"}` |
| Bank times out | `/eval?run=timeout` | `{"mode":"timeout"}` |
| Bank pays, reply lost | `/eval?run=ambiguous` | `{"mode":"ambiguous"}` |
| Same, careless retry | `/eval?run=ambiguous&careless=1` | `{"mode":"ambiguous","unsafeRetry":true}` |

A run takes about 35 seconds. Every run is stored and can be reopened from the "Earlier runs" list on `/eval`.

## What is simulated

The merchants, settlements, bank directory, KYC and risk data, and the bank, KYC and notification APIs are simulated (`lib/engine/world.ts`, `lib/engine/tools.ts`). The orchestration, policy checks, checkpoints, memory, verification, streaming API and traces are real.

## Before submitting

- [ ] Fill the links in `lib/site.ts` (any link left as `#` is hidden on the site).
- [ ] Repository is public, with commits made during the hackathon.
- [ ] At least one commit with an `Entire-Checkpoint` trailer (`entire checkpoint explain HEAD`), and the checkpoint link opens for reviewers. Entire was enabled mid-build, so say so rather than claiming full coverage.
- [ ] Two neatlogs traces saved: before and after a change, and one run with a failed call that recovered (`/console` with chaos on, or `/eval?run=timeout`).
- [ ] At least one #neatHack post published.
- [ ] Demo video recorded.
