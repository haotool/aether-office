ALTER TABLE machines ADD COLUMN allowedProviders TEXT NOT NULL DEFAULT '["demo","claude","codex","acp"]' CHECK(json_valid(allowedProviders));
ALTER TABLE machines ADD COLUMN allowedRoots TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(allowedRoots));
CREATE TABLE machine_invitations (
  id TEXT PRIMARY KEY,
  tokenHash TEXT NOT NULL UNIQUE,
  projectId TEXT NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  concurrency INTEGER NOT NULL CHECK(concurrency BETWEEN 1 AND 4),
  providers TEXT NOT NULL CHECK(json_valid(providers)),
  roots TEXT NOT NULL CHECK(json_valid(roots)),
  createdBy TEXT NOT NULL REFERENCES identities(id),
  expiresAt INTEGER NOT NULL,
  usedAt INTEGER,
  machineId TEXT REFERENCES machines(id)
);
