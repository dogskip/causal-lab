# Tutorial

This walk gets a beginner from zero to a converged simulation receipt in five steps. Every example is lifted from the test suite — nothing here is invented.

## Prerequisites

- Node.js 24 or newer (`node -v`)
- pnpm 10 (`pnpm -v`)

## Step 1 — install

```sh
git clone <repo> causal-lab
cd causal-lab
pnpm install
pnpm build
```

## Step 2 — start the server

```sh
pnpm start
# causal-lab listening on http://127.0.0.1:8787
```

The server binds to `127.0.0.1` only. To change the port set `CAUSAL_LAB_PORT`; the host must remain `127.0.0.1` or `::1`.

## Step 3 — your first run

A scenario has two parts: a `config` (the network) and a list of `steps` (what the replicas do over virtual time). This scenario partitions `a` from `b`, lets `a` write while isolated, then heals:

```sh
curl -X POST http://127.0.0.1:8787/v1/run \
  -H 'content-type: application/json' \
  -d '{
    "config": {
      "replicas": ["a", "b"],
      "seed": 19,
      "minLatency": 1,
      "maxLatency": 3,
      "dropRate": 0.25,
      "duplicateRate": 0.5
    },
    "steps": [
      { "at": 0, "action": "partition", "left": "a", "right": "b" },
      { "at": 1, "action": "put", "replica": "a", "key": "mode", "value": "safe" },
      { "at": 5, "action": "heal" }
    ]
  }'
```

The response is a `SimulationReport`. Two fields to check first:

- `converged: true` — every replica reached the same canonical state after the heal.
- `trace` — an ordered list of every local, scheduled, dropped, held, delivered, partition, and heal event.

Run it again with the same body: the response is byte-identical. That is the central guarantee of the simulator.

## Step 4 — partition, write, heal, converge

Try a scenario that exercises the observed-remove map. Partition two replicas, have each write the same key concurrently, then heal and watch them converge:

```json
{
  "config": { "replicas": ["a", "b"], "seed": 7, "minLatency": 1, "maxLatency": 2, "dropRate": 0, "duplicateRate": 0 },
  "steps": [
    { "at": 0, "action": "partition", "left": "a", "right": "b" },
    { "at": 1, "action": "put", "replica": "a", "key": "mode", "value": "safe" },
    { "at": 2, "action": "put", "replica": "b", "key": "mode", "value": "fast" },
    { "at": 5, "action": "heal" }
  ]
}
```

After the heal, `states.a.mode` and `states.b.mode` both list `["fast", "safe"]` (sorted) — the concurrent writes survived and the replicas converged. A `remove` that observed an earlier value suppresses that value's late delivery, but never a concurrent put.

## Step 5 — persist a scenario and its receipt

To keep a scenario and its run receipt across restarts, enable the catalog with `CAUSAL_LAB_DB`:

```sh
CAUSAL_LAB_DB=./catalog.sqlite pnpm start
```

Store a scenario:

```sh
curl -X POST http://127.0.0.1:8787/v1/scenarios \
  -H 'content-type: application/json' \
  -d '{ ...same scenario... }'
# -> { "id": "<64 hex chars>", "canonicalization": "causal-lab-json-v1" }
```

The `id` is a SHA-256 receipt over the canonical JSON — re-posting the same scenario returns the same `id` (idempotent). Execute and store the run:

```sh
curl -X POST http://127.0.0.1:8787/v1/scenarios/<id>/runs
# -> { "id": "...", "scenarioId": "...", "traceSha256": "...", "converged": true, ... }
```

Fetch it later:

```sh
curl http://127.0.0.1:8787/v1/runs/<run-id>
```

Scenarios and runs are immutable — the database rejects updates and deletes. Re-opening the catalog runs integrity and foreign-key checks before serving.

## Next

- [API reference](api-reference.md) — every route, status code, and schema.
- [Error codes](error-codes.md) — what each 422/404/500 message means and how to fix it.
- [Glossary](glossary.md) — CRDT, dot, version vector, tombstone, anti-entropy.
- [Test contract](test-contract.md) — the 11 invariants the suite enforces.
