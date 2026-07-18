# Test contract

The suite must demonstrate:

1. equal seeds and scenarios produce byte-identical traces and reports;
2. duplicated and reordered operations are idempotent;
3. an observed remove suppresses late delivery of the removed dot but not a concurrent put;
4. version vectors never decrease and operation identifiers are unique;
5. a reliable anti-entropy pass after healing converges every replica;
6. different delivery histories that contain the same operations converge to the same canonical map;
7. replica, event, field, probability, and HTTP body limits are enforced before state mutation.

Limits: 12 replicas, 10,000 events, 2 MiB JSON, 128-byte identifiers and keys, and 4 KiB values.

