# Causal Lab

Causal Lab is a deterministic network simulator for studying an observed-remove map under partitions, latency, drops, duplication, and reordering. A seeded run uses virtual time only, so the same scenario produces the same trace on every machine.

Each replica records dotted operations and a version vector. Put and remove operations carry the exact dots they observed; tombstones make late and duplicated delivery harmless. Healing performs a reliable anti-entropy pass and reports whether all replicas converged to the same canonical state.

An optional content-addressed SQLite catalog persists validated scenarios and immutable deterministic run receipts. It is deliberately outside the simulation core: no storage call, clock, or generated identifier can affect convergence behavior.

## Boundary

- at most 12 replicas and 10,000 scheduled events
- at most 2 MiB per JSON request
- no wall-clock time, sockets, telemetry, hosted state, or dynamic code execution in the simulation core
- scenario identifiers, keys, values, and replica names are bounded before allocation
- canonical scenario and run IDs are SHA-256 receipts over versioned, sorted-key JSON
- SQLite STRICT tables enforce digest, JSON, byte-count, boolean, and foreign-key contracts

The precise invariants are in [`docs/test-contract.md`](docs/test-contract.md). Security assumptions are in [`docs/threat-model.md`](docs/threat-model.md).

## Development

Node 24 or newer and pnpm 10 are required. The core never reads wall-clock time. `pnpm start` serves `POST /v1/run` on `127.0.0.1:8787`; the host remains restricted to `127.0.0.1` or `::1`.

Set `CAUSAL_LAB_DB` to a trusted SQLite file path to add the scenario catalog routes. Without it the original stateless API and its failure surface remain unchanged. See `docs/data-model.md` for the exact tables, receipts, backup boundary, and recovery contract.

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```
