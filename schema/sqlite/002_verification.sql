CREATE TABLE IF NOT EXISTS verification_schema_migrations (
  version INTEGER PRIMARY KEY CHECK (version > 0),
  owner TEXT NOT NULL CHECK (owner = 'causal-lab-verification')
) STRICT;

CREATE TABLE IF NOT EXISTS verification_cases (
  case_id TEXT PRIMARY KEY CHECK (length(CAST(case_id AS BLOB)) = 64 AND instr(case_id, char(0)) = 0 AND case_id NOT GLOB '*[^0-9a-f]*'),
  format_version INTEGER NOT NULL CHECK (format_version = 2),
  canonical_json TEXT NOT NULL CHECK (json_valid(canonical_json) AND json_type(canonical_json) = 'object' AND json_type(canonical_json, '$.format_version') IS 'integer' AND json_extract(canonical_json, '$.format_version') IS format_version),
  definition_bytes INTEGER NOT NULL CHECK (
    definition_bytes BETWEEN 1 AND 2097152 AND
    definition_bytes = length(CAST(canonical_json AS BLOB))
  )
) STRICT, WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS verification_runs (
  run_id TEXT PRIMARY KEY CHECK (length(CAST(run_id AS BLOB)) = 64 AND instr(run_id, char(0)) = 0 AND run_id NOT GLOB '*[^0-9a-f]*'),
  case_id TEXT NOT NULL REFERENCES verification_cases(case_id) ON DELETE RESTRICT,
  format_version INTEGER NOT NULL CHECK (format_version = 2),
  model_id TEXT NOT NULL CHECK (length(CAST(model_id AS BLOB)) BETWEEN 1 AND 128 AND instr(model_id, char(0)) = 0 AND model_id NOT GLOB '*[^A-Za-z0-9._-]*'),
  status TEXT NOT NULL CHECK (status IN ('passed','failed','inconclusive','error')),
  receipt_json TEXT NOT NULL CHECK (
    json_valid(receipt_json) AND json_type(receipt_json) = 'object' AND
    json_type(receipt_json, '$.format_version') IS 'integer' AND
    json_extract(receipt_json, '$.format_version') IS format_version AND
    json_type(receipt_json, '$.case_id') IS 'text' AND
    json_extract(receipt_json, '$.case_id') IS case_id AND
    json_type(receipt_json, '$.manifest.model_id') IS 'text' AND
    json_extract(receipt_json, '$.manifest.model_id') IS model_id AND
    json_type(receipt_json, '$.status') IS 'text' AND
    json_extract(receipt_json, '$.status') IS status
  ),
  receipt_bytes INTEGER NOT NULL CHECK (
    receipt_bytes BETWEEN 1 AND 33554432 AND
    receipt_bytes = length(CAST(receipt_json AS BLOB))
  )
) STRICT, WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS verification_runs_by_case
ON verification_runs(case_id, model_id, status, run_id);

CREATE TRIGGER IF NOT EXISTS verification_cases_no_replace
BEFORE INSERT ON verification_cases
WHEN EXISTS (SELECT 1 FROM verification_cases WHERE case_id = NEW.case_id)
BEGIN
  SELECT RAISE(ABORT, 'existing case requires byte comparison');
END;
CREATE TRIGGER IF NOT EXISTS verification_runs_no_replace
BEFORE INSERT ON verification_runs
WHEN EXISTS (SELECT 1 FROM verification_runs WHERE run_id = NEW.run_id)
BEGIN
  SELECT RAISE(ABORT, 'existing run requires byte comparison');
END;

CREATE TRIGGER IF NOT EXISTS verification_cases_no_update
BEFORE UPDATE ON verification_cases BEGIN
  SELECT RAISE(ABORT, 'verification cases are immutable');
END;
CREATE TRIGGER IF NOT EXISTS verification_cases_no_delete
BEFORE DELETE ON verification_cases BEGIN
  SELECT RAISE(ABORT, 'verification cases are immutable');
END;
CREATE TRIGGER IF NOT EXISTS verification_runs_no_update
BEFORE UPDATE ON verification_runs BEGIN
  SELECT RAISE(ABORT, 'verification runs are immutable');
END;
CREATE TRIGGER IF NOT EXISTS verification_runs_no_delete
BEFORE DELETE ON verification_runs BEGIN
  SELECT RAISE(ABORT, 'verification runs are immutable');
END;

INSERT INTO verification_schema_migrations(version, owner)
SELECT 1, 'causal-lab-verification'
WHERE NOT EXISTS (SELECT 1 FROM verification_schema_migrations WHERE version = 1);
