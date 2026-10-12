# neatlogs evidence

Three traces captured from real runs of this app, traced into a neatlogs project. Each file here is that trace exported
from the neatlogs dashboard as Markdown: every span, its input, its output and any error.

The dashboard links below belong to a private project and need a neatlogs login. They are listed so the trace IDs can be
checked by the project owner. The exports in this folder are the public record.

| File | Trace ID | What it shows |
| --- | --- | --- |
| `trace-b53629b75313dbca1028a5ec5ef5083b.md` | `b53629b75313dbca1028a5ec5ef5083b` | **A failed action and a recovery.** The first `retrigger_settlement` call times out (status ERROR, "bank API timeout (504)"). The run resumes from a checkpoint, retries, and verifies the settlement as settled. neatlogs tags the trace "Execution Failed" because of that injected error. The outcome is resolved. It also contains the local model call that wrote the email subject line. |
| `trace-480214b47010870fcaec8fe505d5197e.md` | `480214b47010870fcaec8fe505d5197e` | **Before: a careless retry.** The bank paid but the reply was lost. The retry uses a new idempotency key (`..._retry1`) and the bank answers `duplicate: false`, so the settlement is paid twice while the agent still reports success. This is a deliberate demonstration mode, not how the Resolver normally behaves. |
| `trace-d49e123c5f2fbb81817ab6154aa2f129.md` | `d49e123c5f2fbb81817ab6154aa2f129` | **After: one idempotency key across retries.** The same case. The retry reuses the key and the bank answers `duplicate: true`, so it is paid once. |

## How to read them

- Find the two `retrigger_settlement` spans in each file. In the BEFORE file the second has a different `idempotencyKey`
  and `"duplicate": false`. In the AFTER file both keys match and the second says `"duplicate": true`.
- The agents cannot see how many times the bank has paid. The bank's payout counter and idempotency-key store are not
  part of what the simulated bank API returns to them, so no span in these files contains them. The scorecard at `/eval`
  reads them from the simulated world instead.

## Dashboard links (private project, login required)

- Recovery: https://app.neatlogs.com/traces/b53629b75313dbca1028a5ec5ef5083b?orgId=8c7f9c26-2dba-4682-93ac-09479d297e58&projectId=be800dc6-4fa9-4f52-8a7d-45d1a815cb28
- Before: https://app.neatlogs.com/traces/480214b47010870fcaec8fe505d5197e?orgId=8c7f9c26-2dba-4682-93ac-09479d297e58&projectId=be800dc6-4fa9-4f52-8a7d-45d1a815cb28
- After: https://app.neatlogs.com/traces/d49e123c5f2fbb81817ab6154aa2f129?orgId=8c7f9c26-2dba-4682-93ac-09479d297e58&projectId=be800dc6-4fa9-4f52-8a7d-45d1a815cb28
