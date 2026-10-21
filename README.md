---
title: "crdt-fuzz"
authority_level: entrypoint
ssot: true
owner: shared
status: partial
last_updated: 2026-10-21
derived_from: ["docs/verification.md", ".planning/IMPLEMENTATION.md", ".planning/GROWTH.md"]
source_of_truth_for: ["project entrypoint"]
must_not_be_overridden_by: []
ai_edit_policy: editable-but-must-not-contradict-sources
---

# crdt-fuzz

**CRDTs converge. That doesn't mean they're correct.**

Deterministic fault injection for CRDTs and local-first sync. Run real CRDT code
through partitions, drops, duplicates and variable latency, then replay the exact
schedule that produced the result.

```sh
npx crdt-fuzz run --target yjs
```

[Interactive demo](https://dogskip.github.io/causal-lab/ko/) · [verification guide](docs/verification.md) · [a passing Yjs case](examples/verification/yjs.json)

## Status

`0.3.0-alpha.1` is the first public name. The npm publication and the English
viewer are the next steps; the interactive demo is still Korean-first. From a
checkout, the same run is:

```sh
pnpm install
pnpm build
pnpm exec tsx src/verify-cli.ts run --target yjs
```

## What works today

- Seeded, virtual-time schedules with partitions, drops, duplicates and variable latency.
- Convergence and expected-state checks against real Yjs 13.6.27 and the built-in OR-Map.
- Replayable v2 bundles: the same schedule returns the same receipt.
- A v1 HTTP simulator, REPL and SQLite catalog, kept for compatibility.

## What is next

- Lost-write, idempotence and schema checks.
- An English-first timeline viewer and an adapter SDK.
- A public report of replayable CRDT integration failures.

## Limits

A passing run is not a proof of correctness. The alpha covers Yjs and the built-in
OR-Map only; Loro and Automerge are planned. The report cases are candidates until
they reproduce on a pinned version. Library tests and this harness answer different
questions: the harness checks the schedule and the observed state, not every internal
invariant of the library. Bundles produced from a source checkout and from an npm
install carry different engine identities; replay a bundle with the same
distribution that produced it.

## Install from source

```sh
pnpm install
pnpm build
pnpm verify verify examples/verification/yjs.json --out ./verification-results
```

Open `dist/web/verification.html` in a browser to inspect a result file. Use the
CLI's `replay` command to execute the same target and compare the entire receipt.
Browser inspection does not execute target code.

## Legacy simulator (v1)

The original deterministic OR-Map playground and the v1 HTTP server remain
available. They are not the product surface; the verification path above is.

The v1 simulator uses dotted operations, observed removals, virtual time and
seeded network faults. Its optional SQLite catalog is separate from the
verification database.

### Boundary

- at most 12 replicas and 10,000 scheduled events
- at most 2 MiB per JSON request
- no wall-clock time, sockets, telemetry, hosted state, or dynamic code execution in the simulation core
- scenario identifiers, keys, values, and replica names are bounded before allocation
- canonical scenario and run IDs are SHA-256 receipts over versioned, sorted-key JSON
- SQLite STRICT tables enforce digest, JSON, byte-count, boolean, and foreign-key contracts

The precise invariants are in [`docs/test-contract.md`](docs/test-contract.md). Security assumptions are in [`docs/threat-model.md`](docs/threat-model.md).

### Quickstart

```sh
pnpm install
pnpm start   # causal-lab listening on http://127.0.0.1:8787
```

Run a scenario (partition, write while isolated, heal, converge):

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

The response is a `SimulationReport` with `converged: true` and an ordered `trace`.
Re-run it with the same body: the response is byte-identical.

New here? Read the [tutorial](docs/tutorial.md). For the full contract see the
[API reference](docs/api-reference.md), [error codes](docs/error-codes.md), and
[OpenAPI spec](docs/openapi.json).

## Try it without writing JSON

The REPL lets you explore the model interactively — no scenario JSON required:

```sh
pnpm repl
> partition a b        # split the network
> put a mode safe      # write while isolated
> put b mode fast      # concurrent write on the other side
> heal                 # clear partitions + reliable anti-entropy
> run                  # drain scheduled events, print convergence
> mermaid              # render the trace as a sequence diagram
```

Or run a ready-made scenario without copy-pasting JSON:

```sh
curl -X POST http://127.0.0.1:8787/v1/run -H 'content-type: application/json' -d @examples/partition-heal.json
```

See [`examples/`](examples/README.md) for partition/heal, concurrent put,
observed-remove, and three-replica drop scenarios. Each example is covered by
`test/examples.test.ts`.

## Trace visualization

A `SimulationReport.trace` is a flat event list. `traceToMermaid(trace)` (exported
from `crdt-fuzz`) turns it into a Mermaid `sequenceDiagram` showing who talks to
whom and where messages are dropped or held — paste it into GitHub markdown or
[mermaid.live](https://mermaid.live). The REPL's `mermaid` command prints it
directly.

## Browser demo

The English landing page is at `/`; the interactive Korean demo is at `/ko/`. It
is a self-explanatory tour of what the simulator is for: pick a story ("분할 → 복구",
"동시 쓰기 보존", "관찰된 제거", "3복제본 + 패킷 손실"), and it runs immediately and
plays back on a virtual-time timeline — partition bands, message arrows, drops,
held messages, and a caption that says in plain words what is happening at this
instant. Below it, one card per replica shows the values it holds right now, so
the moment two replicas disagree and the heal that resolves them are both visible.

```sh
pnpm build:site   # writes dist/web
pnpm dev:web      # dev server on http://localhost:5173
```

The dev server has no live reload: the page's `connect-src 'none'` CSP blocks the
HMR socket, and the console reports that refusal. That is the same policy the
published page runs under, so reload the tab after an edit instead of loosening it.

The playground is not part of the simulation contract. Its defences are enforced
rather than asserted: `test/web-security.test.ts` fails if the playground grows an
HTML injection sink, a network call, an external resource, or loses its meta CSP,
and `test/web-bundle.test.ts` runs the built browser bundle in Node and requires it
to report exactly what the Node core reports. Every claim a story card makes about
its own run is checked in `test/stories.test.ts`.

Pages deploys on every push to `main`, and the workflow can also be run by hand.
It rebuilds, re-runs the suite, and uploads `dist/web`.

## Development

Node 24 or newer and pnpm 10 are required. The core never reads wall-clock time.
`pnpm start` serves `POST /v1/run` on `127.0.0.1:8787`; the host remains restricted
to `127.0.0.1` or `::1`.

`pnpm test` reads `dist/web/core.js`, so run `pnpm build` first on a fresh clone.
`pnpm test:deep` raises the property run count to 5,000.

Set `CAUSAL_LAB_DB` to a trusted SQLite file path to add the scenario catalog
routes. Without it the original stateless API and its failure surface remain
unchanged. See `docs/data-model.md` for the exact tables, receipts, backup
boundary, and recovery contract.

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```
