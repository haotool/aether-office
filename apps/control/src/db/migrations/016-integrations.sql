-- SQLite cannot alter a CHECK constraint: rebuild runner_jobs to allow the 'integrate' kind.
CREATE TABLE runner_jobs_new(id TEXT PRIMARY KEY, projectId TEXT NOT NULL REFERENCES projects(id), workId TEXT NOT NULL REFERENCES work_items(id), workspaceId TEXT NOT NULL REFERENCES workspaces(id), machineId TEXT NOT NULL REFERENCES machines(id), kind TEXT NOT NULL CHECK(kind IN ('diff','verify','integrate')), state TEXT NOT NULL CHECK(state IN ('queued','running','succeeded','failed','indeterminate')), payload TEXT NOT NULL CHECK(json_valid(payload)), result TEXT CHECK(result IS NULL OR json_valid(result)), requestedBy TEXT NOT NULL REFERENCES identities(id), expectedHead TEXT NOT NULL, expectedVersion INTEGER NOT NULL, createdAt INTEGER NOT NULL, startedAt INTEGER, finishedAt INTEGER);
INSERT INTO runner_jobs_new SELECT * FROM runner_jobs;
DROP TABLE runner_jobs;
ALTER TABLE runner_jobs_new RENAME TO runner_jobs;
CREATE INDEX runner_jobs_pending ON runner_jobs(machineId,state,createdAt);
CREATE TABLE integrations (
  jobId TEXT PRIMARY KEY REFERENCES runner_jobs(id),
  projectId TEXT NOT NULL REFERENCES projects(id),
  workId TEXT NOT NULL REFERENCES work_items(id),
  status TEXT NOT NULL CHECK(status IN ('merged','up_to_date','conflict','base_moved')),
  baseBranch TEXT NOT NULL,
  baseSha TEXT NOT NULL,
  headSha TEXT NOT NULL,
  mergeSha TEXT,
  candidate TEXT,
  detail TEXT NOT NULL CHECK(json_valid(detail)),
  createdAt INTEGER NOT NULL
);
CREATE INDEX integrations_work ON integrations(workId,createdAt);
