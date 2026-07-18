# Threat model

## Assets and inputs

The simulator protects deterministic trace order, operation identity, version-vector monotonicity, observed-remove semantics, bounded resource use, scenario identity, and immutable run receipts. Scenario JSON, replica names, keys, values, topology changes, network probabilities, catalog IDs, and database contents are untrusted.

## Defended cases

- replica and event caps are checked before work is scheduled
- the HTTP adapter limits request bodies to 2 MiB and rejects unknown fields
- a fixed seed drives all latency, drop, duplication, and reorder choices
- operations are immutable data; duplicate delivery is idempotent and remove tombstones survive out-of-order delivery
- virtual time is an integer controlled by the simulation, not by timers or the host clock
- public failures report contract errors without stack traces or environment paths
- storage is injected at the HTTP boundary and is never imported by CRDT or simulation modules
- prepared statements bind all catalog values; extension loading and double-quoted string literals are disabled
- catalog creation executes the bounded pure scenario once, so semantically invalid replica references are never persisted
- database files reject symbolic-link targets and are restricted to process-owner permissions
- STRICT tables, immutable triggers, foreign keys, digest recomputation, and open-time health checks detect drift

## Non-goals

This is not a Byzantine protocol, consensus system, authentication service, or performance benchmark. The optional local catalog is not a multi-writer distributed database. It does not defend against a process-account compromise or attempt to model every transport behavior.
