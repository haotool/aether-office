CREATE TABLE file_reservations (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL REFERENCES projects(id),
  ownerId TEXT NOT NULL REFERENCES identities(id),
  workId TEXT REFERENCES work_items(id),
  patterns TEXT NOT NULL,
  fence INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','released')),
  expiresAt INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,
  releasedAt INTEGER,
  UNIQUE(projectId,fence)
);
CREATE INDEX reservation_active ON file_reservations(projectId,state,expiresAt);
