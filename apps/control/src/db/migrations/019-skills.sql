CREATE TABLE skills (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  body TEXT NOT NULL,
  warnings TEXT NOT NULL CHECK(json_valid(warnings)),
  contentHash TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  importedBy TEXT NOT NULL REFERENCES identities(id),
  version INTEGER NOT NULL DEFAULT 1,
  updatedAt INTEGER NOT NULL,
  UNIQUE(projectId,name)
);
