CREATE TABLE schedules (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  spec TEXT NOT NULL CHECK(json_valid(spec)),
  timezone TEXT NOT NULL,
  missed TEXT NOT NULL CHECK(missed IN ('skip','single')),
  template TEXT NOT NULL CHECK(json_valid(template)),
  enabled INTEGER NOT NULL DEFAULT 1,
  nextRunAt INTEGER,
  lastOccurrence INTEGER,
  createdBy TEXT NOT NULL REFERENCES identities(id),
  version INTEGER NOT NULL DEFAULT 1,
  createdAt INTEGER NOT NULL
);
CREATE INDEX schedules_due ON schedules(enabled,nextRunAt);
CREATE TABLE schedule_runs (
  scheduleId TEXT NOT NULL REFERENCES schedules(id),
  occurrence INTEGER NOT NULL,
  workId TEXT REFERENCES work_items(id),
  outcome TEXT NOT NULL CHECK(outcome IN ('dispatched','skipped','failed')),
  createdAt INTEGER NOT NULL,
  PRIMARY KEY(scheduleId,occurrence)
);
