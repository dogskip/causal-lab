# Threat model

## Assets and inputs

The simulator protects deterministic trace order, operation identity, version-vector monotonicity, observed-remove semantics, and bounded resource use. Scenario JSON, replica names, keys, values, topology changes, and network probabilities are untrusted.

## Defended cases

- replica and event caps are checked before work is scheduled
- the HTTP adapter limits request bodies to 2 MiB and rejects unknown fields
- a fixed seed drives all latency, drop, duplication, and reorder choices
- operations are immutable data; duplicate delivery is idempotent and remove tombstones survive out-of-order delivery
- virtual time is an integer controlled by the simulation, not by timers or the host clock
- public failures report contract errors without stack traces or environment paths

## Non-goals

This is not a production database, Byzantine protocol, consensus system, authentication service, or performance benchmark. It does not defend against a process-account compromise or attempt to model every transport behavior.

