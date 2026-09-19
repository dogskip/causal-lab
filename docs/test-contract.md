# Test contract

The suite must demonstrate:

1. equal seeds and scenarios produce byte-identical traces and reports;
2. duplicated and reordered operations are idempotent;
3. an observed remove suppresses late delivery of the removed dot but not a concurrent put;
4. version vectors never decrease and operation identifiers are unique;
5. a reliable anti-entropy pass after healing converges every replica;
6. different delivery histories that contain the same operations converge to the same canonical map;
7. replica, event, field, probability, and HTTP body limits are enforced before state mutation.
8. object key order and whitespace do not change a scenario ID, while semantic changes do;
9. repeated deterministic execution produces one immutable run receipt across database reopen;
10. catalog migrations are idempotent and integrity, foreign-key, hash, byte-count, and trace checks pass;
11. catalog routes are absent when storage is not configured and preserve the stateless run contract.

Limits: 12 replicas, 10,000 events, 2 MiB JSON, 128-byte identifiers and keys, 4 KiB values, and 1,000 steps.

## Why convergence holds

`heal` clears every partition, re-enqueues the events that partitions held, and then re-broadcasts every operation each replica stores on a path that is never dropped or duplicated. A replica's state is a function of the operation set it has received, so after a heal every replica has received every operation and reports the same canonical map.

That argument fixes what is left to falsify, and the property suite targets it:

- the `converged` flag is derived, not trusted: properties recompute convergence from the reported replica states by per-key set comparison and assert the flag agrees, so a bug in the flag is a counterexample instead of a silent pass;
- the network layer carries the risk: a lossless family checks that no value disappears across partitions, drops, and duplicates, and an observed-remove family checks that a remove tombstones only the dots its issuer had observed.

## What property tests do not claim

- They are disproof attempts, not proof. A green run is an accumulation of failed disproof attempts, not a statement about every scenario.
- The oracle assumes what the generator guarantees: all writes of one key share a step time (latency is at least 1, so no delivery precedes them) and each (key, replica) pair is written once. Other shapes are covered by unit and integration tests, not by the oracle.
- The search is bounded by the generated inputs and the run count. Deeper runs (`pnpm test:deep`) widen the search; they do not close it.
- The merge-rule oracle is a second implementation of the same written rule, so a misreading of the rule is shared. Nothing here defends against a Byzantine replica, a hostile host, or a wall clock — the core has none.
