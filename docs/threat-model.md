# Threat model

## Assets and inputs

The simulator protects deterministic trace order, operation identity, version-vector monotonicity, observed-remove semantics, bounded resource use, scenario identity, and immutable run receipts. Scenario JSON, replica names, keys, values, topology changes, network probabilities, catalog IDs, and database contents are untrusted. So is scenario text pasted, dropped, or opened in the browser playground, together with the values it renders.

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
- receipts are hashed by one implementation shared with the browser, checked against published vectors and `node:crypto`
- the playground renders values as text only (canvas text and text nodes) and carries no HTML injection sink or dynamic code execution; a meta CSP allows only same-origin script and style
- the playground makes no network call and loads no external resource, so a scenario cannot exfiltrate anything
- the playground accepts scenarios from local input only (paste, file, bundled examples) and validates each through `parseScenario`, with the same byte cap as the HTTP adapter
- the playground ships the core modules unchanged, so there is no second simulation implementation to drift

## Non-goals

This is not a Byzantine protocol, consensus system, authentication service, or performance benchmark. The optional local catalog is not a multi-writer distributed database. It does not defend against a process-account compromise or attempt to model every transport behavior. The playground has no accounts, no stored state, and no server: anyone who can open it can run any scenario inside the contract limits, and the integrity of the published page depends on the hosting provider.
