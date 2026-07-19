# Example scenarios

Ready-to-run scenarios validated against the simulation contract. Feed them straight to the server with `-d @<file>`:

```sh
# start the stateless simulator
pnpm start

# run an example
curl -X POST http://127.0.0.1:8787/v1/run \
  -H 'content-type: application/json' \
  -d @examples/partition-heal.json
```

Every example is covered by `test/examples.test.ts`, which asserts it parses, runs, and (where expected) converges. Add a new example by dropping a JSON file here and adding one line to that test.

| File | Demonstrates |
|------|--------------|
| `partition-heal.json` | Partition, write while isolated, heal, converge. The canonical quickstart. |
| `concurrent-put.json` | Two replicas write the same key concurrently; both values survive the merge (multi-value register). |
| `observed-remove.json` | A `remove` only deletes what the remover observed — a concurrent `put` survives. |
| `three-replica-drop.json` | Three replicas, message drops, a partition between two of them, and eventual convergence on heal. |
