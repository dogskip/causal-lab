CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY CHECK (version > 0),
    applied_by TEXT NOT NULL CHECK (applied_by = 'causal-lab')
) STRICT;

CREATE TABLE IF NOT EXISTS scenarios (
    scenario_id TEXT PRIMARY KEY CHECK (
        length(scenario_id) = 64 AND scenario_id NOT GLOB '*[^0-9a-f]*'
    ),
    canonicalization TEXT NOT NULL CHECK (canonicalization = 'causal-lab-json-v1'),
    canonical_json TEXT NOT NULL CHECK (json_valid(canonical_json)),
    definition_bytes INTEGER NOT NULL CHECK (definition_bytes > 0 AND definition_bytes <= 2097152)
) STRICT, WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS runs (
    run_id TEXT PRIMARY KEY CHECK (
        length(run_id) = 64 AND run_id NOT GLOB '*[^0-9a-f]*'
    ),
    scenario_id TEXT NOT NULL,
    report_json TEXT NOT NULL CHECK (json_valid(report_json)),
    trace_sha256 TEXT NOT NULL CHECK (
        length(trace_sha256) = 64 AND trace_sha256 NOT GLOB '*[^0-9a-f]*'
    ),
    processed_events INTEGER NOT NULL CHECK (processed_events >= 0),
    converged INTEGER NOT NULL CHECK (converged IN (0, 1)),
    FOREIGN KEY (scenario_id) REFERENCES scenarios(scenario_id) ON DELETE RESTRICT
) STRICT, WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS runs_by_scenario ON runs(scenario_id, run_id);

CREATE TRIGGER IF NOT EXISTS scenarios_immutable_update
BEFORE UPDATE ON scenarios BEGIN
    SELECT RAISE(ABORT, 'scenarios are immutable');
END;

CREATE TRIGGER IF NOT EXISTS scenarios_immutable_delete
BEFORE DELETE ON scenarios BEGIN
    SELECT RAISE(ABORT, 'scenarios are immutable');
END;

CREATE TRIGGER IF NOT EXISTS runs_immutable_update
BEFORE UPDATE ON runs BEGIN
    SELECT RAISE(ABORT, 'runs are immutable');
END;

CREATE TRIGGER IF NOT EXISTS runs_immutable_delete
BEFORE DELETE ON runs BEGIN
    SELECT RAISE(ABORT, 'runs are immutable');
END;

INSERT OR IGNORE INTO schema_migrations(version, applied_by) VALUES (1, 'causal-lab');
