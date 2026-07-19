# API reference

All routes are bound to `127.0.0.1` (or `::1`). The machine-readable contract is in [`docs/openapi.json`](openapi.json); the request/response JSON Schemas are in [`schema/scenario.schema.json`](../schema/scenario.schema.json) and [`schema/report.schema.json`](../schema/report.schema.json).

The catalog routes (marked **catalog**) are available only when `CAUSAL_LAB_DB` is set. `POST /v1/run` is always available and stateless.

## POST /v1/run

Execute a scenario in virtual time. Stateless — no catalog interaction.

- Request body: [Scenario](../schema/scenario.schema.json), `application/json`, max 2 MiB.
- `200` — [SimulationReport](../schema/report.schema.json).
- `413` — body exceeds 2 MiB: `{ "error": "request body is too large" }`.
- `422` — scenario violates the simulation contract. The `error` field carries the specific message (e.g. `"seed must be an unsigned 32-bit integer"`). See [error codes](error-codes.md).
- `500` — unexpected simulation failure: `{ "error": "simulation failed" }`.

## POST /v1/scenarios  *(catalog)*

Parse, validate, execute once (to reject semantically invalid scenarios), and persist a content-addressed scenario. Idempotent — re-posting the same scenario returns the same `id`.

- Request body: [Scenario](../schema/scenario.schema.json), `application/json`, max 2 MiB.
- `201` — `{ "id": "<64 hex>", "canonicalization": "causal-lab-json-v1" }`.
- `413` — body too large.
- `422` — contract violation.
- `500` — catalog failure: `{ "error": "catalog failure", "code": "corruption|schema|missing" }`.

## GET /v1/scenarios/:id  *(catalog)*

Fetch a stored scenario.

- Path param `id`: 64 lowercase hex chars.
- `200` — `{ "id", "canonicalization", "scenario" }`.
- `404` — scenario was not found: `{ "error": "scenario was not found" }`. If the catalog is not configured, all catalog routes return `{ "error": "catalog is not configured; set CAUSAL_LAB_DB" }`.

## POST /v1/scenarios/:id/runs  *(catalog)*

Re-execute a stored scenario and persist the immutable run receipt. No request body.

- Path param `id`: scenario id.
- `201` — [StoredRun](../schema/report.schema.json) (`{ "id", "scenarioId", "traceSha256", "processedEvents", "converged", "report" }`).
- `404` — scenario was not found, or catalog not configured.
- `500` — catalog failure.

## GET /v1/runs/:id  *(catalog)*

Fetch a stored run receipt.

- Path param `id`: 64 lowercase hex chars.
- `200` — [StoredRun](../schema/report.schema.json).
- `404` — run was not found, or catalog not configured.

## Error responses

All errors share `{ "error": string, "code"?: string }`. The `code` field appears only on catalog failures (HTTP 500) and is one of `corruption`, `schema`, `missing`. See [error codes](error-codes.md) for the full mapping.

## Limits

Enforced before any state mutation:

| Limit | Value |
|-------|-------|
| Replicas | 2–12 |
| Scheduled events | 10,000 |
| Scenario steps | 1,000 |
| HTTP body | 2 MiB |
| Identifiers / keys | 128 bytes, `[A-Za-z0-9._-]+` |
| Values | 4 KiB |
| Seed | unsigned 32-bit integer |
| Latency | 0–60,000 (integer), `min ≤ max` |
| `dropRate` / `duplicateRate` | 0–1 |
