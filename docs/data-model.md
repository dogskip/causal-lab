# Scenario catalog data model

The simulator remains a pure deterministic core. Storage is an optional adapter enabled by CAUSAL_LAB_DB, so a database failure cannot alter CRDT or virtual-time semantics and removing the setting restores the original stateless service.

## Identity

Validated JSON is encoded with causal-lab-json-v1: object keys are sorted, arrays retain order, and only finite JSON values are admitted. The scenario ID is SHA-256 over the version label, a separator, and those canonical bytes. Key order and whitespace therefore do not change identity, while any semantic field does.

Run IDs bind a scenario ID to the complete canonical report. trace_sha256 separately makes trace verification and indexing cheap. Repeating one deterministic scenario produces the same immutable receipt rather than another timestamp-based row.

## Tables

- scenarios stores scenario_id, canonicalization, canonical_json, and definition_bytes.
- runs stores run_id, scenario_id, report_json, trace_sha256, processed_events, and converged.
- schema_migrations records the applied schema version and owner.

All tables use STRICT typing. Digest shape, JSON validity, byte and event bounds, booleans, and the scenario foreign key are database constraints. Triggers reject updates and deletes from content-addressed rows. On every open the adapter runs integrity_check and foreign_key_check.

## Operations and recovery

POST /v1/scenarios stores a validated definition. GET /v1/scenarios/:id returns it. POST /v1/scenarios/:id/runs executes and stores the deterministic receipt, and GET /v1/runs/:id reads it. These routes exist only when the catalog is configured; POST /v1/run remains stateless and backward compatible.

For a live backup, use the SQLite backup API or briefly stop the single process and copy the database together with its WAL and shared-memory files. A portable rollback is an export of canonical scenario and report JSON, verified again by their IDs before import.
