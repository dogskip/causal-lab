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

Limits: 12 replicas, 10,000 events, 2 MiB JSON, 128-byte identifiers and keys, and 4 KiB values.
