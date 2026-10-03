CREATE TABLE session_credentials(identityId TEXT PRIMARY KEY REFERENCES identities(id),runId TEXT NOT NULL REFERENCES runs(id),machineId TEXT NOT NULL REFERENCES machines(id));
CREATE INDEX session_credentials_run ON session_credentials(runId);
