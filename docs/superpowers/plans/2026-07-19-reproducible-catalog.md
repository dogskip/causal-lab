# Reproducible Scenario Catalog Implementation Plan

**Goal:** Add a content-addressed SQLite catalog for scenarios and deterministic run receipts while keeping CRDT semantics storage-independent.
**Architecture:** Parsing and execution become pure reusable functions. A catalog adapter stores canonical scenario JSON and immutable reports; the simulator never imports storage.
**Tech Stack:** TypeScript 5.9, Node.js 24 node:sqlite, Hono, Vitest, SQLite STRICT tables
**Verification:** pnpm lint; pnpm typecheck; pnpm test; pnpm build; PRAGMA foreign_key_check and integrity_check.

---

## Three-pass review

1. Repository evidence: validation and execution live inside one HTTP handler, preventing reusable scenario identity.
2. External standard: CRDTs converge from the same update set; SQLite offers strict typing and atomic single-file storage.
3. Adversarial review: timestamps, random IDs, mutable reports, arbitrary invariant code, and user-controlled SQL were rejected.

## Decision

Canonicalize validated scenarios with sorted keys and SHA-256. The digest is the scenario ID. Store one immutable report and trace digest per scenario. Existing POST /v1/run stays compatible; catalog routes exist only when configured.

## SQLite schema

- scenarios(scenario_id, canonical_json, definition_bytes)
- runs(run_id, scenario_id, report_json, trace_sha256, processed_events, converged)
- schema_migrations(version, applied_by)

IDs are 64 lowercase hex characters, JSON is checked, and reports reference scenarios.

## Implementation tasks

### Task 1: Extract pure scenario execution

**Files:** Create src/scenario.ts and test/scenario.test.ts; modify src/app.ts.

- [x] Add failing tests for identity across key order and byte-identical execution.

### Task 2: Implement the catalog

**Files:** Create schema/sqlite/001_catalog.sql, src/catalog.ts, and test/catalog.test.ts.

- [x] Test migration idempotence, immutable replay, hash rejection, foreign keys, reopen, and integrity checks.
- [x] Use prepared statements and disable extensions.

### Task 3: Add catalog routes

**Files:** Modify src/app.ts, src/server.ts, and test/app.test.ts.

- [x] Add create, fetch, and run receipt routes without changing stateless limits.

### Task 4: Document recovery

**Files:** Modify README.md, docs/test-contract.md, and docs/threat-model.md; create docs/data-model.md.

- [x] Document WAL-aware backup and canonical JSON export rollback.

## Risk and rollback

- Medium: isolate the active-development Node SQLite API in one adapter.
- Medium: version canonicalization and pin it with fixtures.
- Low: fail startup on integrity or foreign-key errors.
- Rollback: omit CAUSAL_LAB_DB; stateless execution remains unchanged.
