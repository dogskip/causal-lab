# Glossary

- **CRDT (Conflict-free Replicated Data Type)** — A data structure that replicas can update independently and merge without coordination, always converging to the same state once they have received the same set of operations. Causal Lab implements an *observed-remove map*.
- **Observed-remove map (OR-Map)** — A map where a `remove` only deletes the values the remover had *observed* at the time of removal. Values written concurrently with the remove survive. This is what makes concurrent edits safe.
- **Dot** — A unique operation identifier of the form `{ replica, counter }`. Each `put` and `remove` is tagged with a dot drawn from the issuing replica's version vector.
- **Version vector** — A map from replica id to that replica's highest observed counter. Used to detect duplicates (a dot already seen is skipped) and to compare causal histories (`dominates`).
- **Tombstone** — A dot that has been removed. Once a dot is a tombstone, a late-arriving `put` of that dot is suppressed (idempotent), but a concurrent put with a fresh dot is not.
- **Anti-entropy** — A reliable pass that resends every known operation to every replica so they converge. Causal Lab performs this on `heal`; it is reliable (no drops, no duplicates) so convergence is guaranteed afterward.
- **Virtual time** — An integer tick the simulator advances manually (`advance`, step `at` times). There is no wall clock in the core — virtual time is what makes runs deterministic and reproducible.
- **Deterministic simulation** — The same `seed` + scenario always produces the byte-identical trace and report, on every machine. The scheduler, RNG, and clock are all controlled; there is no `Date.now()`, `Math.random()`, or socket in the core.
- **Content-addressing** — Identifiers are SHA-256 receipts over canonical JSON, not random or timestamp-based. The same scenario content always yields the same id; the id is also an integrity check.
- **Canonical JSON** — A normalized JSON form (`causal-lab-json-v1`) with sorted object keys, preserved array order, and finite numbers only. Used so that semantically-equal scenarios produce identical bytes and thus identical ids.
- **Receipt** — An immutable record (a scenario or a run) keyed by its SHA-256 digest. Re-running the same scenario produces the same receipt; the catalog rejects updates and deletes to receipts.
- **Trace** — The ordered list of events (`local`, `scheduled`, `dropped`, `held`, `delivered`, `partition`, `heal`) the simulator recorded. The trace is what makes a run inspectable and reproducible.
- **Partition** — A network split between two replicas; messages between them are held until a `heal`.
- **Heal** — Clears all partitions and runs reliable anti-entropy so every replica converges.
