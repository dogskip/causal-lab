# Error codes

Every error response is `{ "error": string, "code"?: string }`. Contract violations return the **specific** message in `error` (not a generic string) so you can debug without reading server logs. The `code` field appears only on catalog failures.

## HTTP 422 — scenario violates the simulation contract

Returned by `POST /v1/run`, `POST /v1/scenarios`. The `error` field is one of these messages:

| Message | Cause | Fix |
|--------|-------|-----|
| `scenario must be an object` | Top-level body is not a JSON object. | Send `{ "config": {...}, "steps": [...] }`. |
| `scenario contains an unknown field` | A field is present that is not allowed. | Remove the field (e.g. `executable`). |
| `config must be an object` | `config` is missing or not an object. | Provide `config`. |
| `config contains an unknown field` | `config` has a disallowed key. | Keep only `replicas, seed, minLatency, maxLatency, dropRate, duplicateRate`. |
| `<field> is required` | A required `config` field is missing. | Add the named field. |
| `<field> must be a finite number` | A numeric field is absent-wrong-type or non-finite. | Use a finite number. |
| `<field> must be a string` | A string field is the wrong type. | Use a string. |
| `replicas must be strings` | `config.replicas` contains a non-string. | Use an array of strings. |
| `replica is invalid` / `key is invalid` | Identifier does not match `^[A-Za-z0-9._-]+$` or exceeds 128 bytes. | Use only `A-Za-z0-9._-`, ≤ 128 bytes. |
| `simulation requires 2 to 12 replicas` | Replica count outside `[2, 12]`. | Use 2–12 unique replicas. |
| `replica identifiers must be unique` | Duplicate replica names. | Remove duplicates. |
| `seed must be an unsigned 32-bit integer` | `seed` outside `[0, 4294967295]`. | Use an integer in range. |
| `latency range is invalid` | `minLatency`/`maxLatency` not integers, `min > max`, or `max > 60000`. | Use integers with `0 ≤ min ≤ max ≤ 60000`. |
| `network probabilities must be between zero and one` | `dropRate`/`duplicateRate` outside `[0, 1]`. | Use a number in `[0, 1]`. |
| `steps must contain at most 1000 entries` | More than 1000 steps. | Reduce to ≤ 1000. |
| `step must be an object` / `step contains an unknown field` | A step is malformed. | Match the step schema for its `action`. |
| `step action is invalid` | `action` is not `put|remove|partition|heal`. | Use a valid action. |
| `step times must be non-decreasing safe integers` | `at` values decrease or are non-integer. | Sort steps by ascending `at`. |
| `value exceeds 4096 bytes` | A `put` value is too long. | Shorten to ≤ 4 KiB. |
| `unknown replica: <id>` | A step references a replica not in `config.replicas`. | Add the replica to `config.replicas` or fix the name. |
| `a replica cannot be partitioned from itself` | `partition` with `left === right`. | Partition two distinct replicas. |
| `simulation exceeds 10000 scheduled events` | The scenario schedules more than 10,000 events. | Reduce replicas, steps, or values. |
| `advance duration must be a non-negative integer` | (Internal) negative or fractional advance. | — |
| `canonical JSON requires finite numbers` / `value is not representable as canonical JSON` | (Internal) non-JSON-representable value in canonicalization. | — |
| `operation kind is invalid` / `operation counter must be a positive safe integer` / `operation removal context is invalid` | (Internal) malformed `Operation`. | — |

## HTTP 413 — request body too large

`{ "error": "request body is too large" }` — the body exceeds 2 MiB. Reduce the scenario size.

## HTTP 404

| Message | Cause |
|---------|-------|
| `route was not found` | No route matched the path/method. Check the URL. |
| `scenario was not found` | `GET /v1/scenarios/:id` or `POST /v1/scenarios/:id/runs` with an unknown id. |
| `run was not found` | `GET /v1/runs/:id` with an unknown id. |
| `catalog is not configured; set CAUSAL_LAB_DB` | A catalog route was hit while `CAUSAL_LAB_DB` is unset. Restart the server with the env var, or use `POST /v1/run`. |

## HTTP 500

| Body | Cause |
|------|-------|
| `{ "error": "simulation failed" }` | An unexpected error that is not a contract violation or catalog failure. |
| `{ "error": "catalog failure", "code": "corruption" }` | A stored scenario or run failed its content-identity, byte-count, integrity, or foreign-key check. The database file may be corrupt; restore from backup. |
| `{ "error": "catalog failure", "code": "schema" }` | The catalog schema version or canonicalization is not supported. |
| `{ "error": "catalog failure", "code": "missing" }` | A run was requested for a scenario id that does not exist in the catalog. |

Catalog failure messages keep the specific detail server-side; only the stable `code` is exposed, per the threat model (no paths, env, or stack traces).
