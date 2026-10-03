CREATE TABLE review_comments (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL REFERENCES projects(id),
  workId TEXT NOT NULL REFERENCES work_items(id),
  authorId TEXT NOT NULL REFERENCES identities(id),
  headSha TEXT NOT NULL,
  path TEXT NOT NULL,
  hunkHash TEXT NOT NULL,
  line INTEGER,
  body TEXT NOT NULL,
  createdAt INTEGER NOT NULL
);
CREATE INDEX review_comments_work ON review_comments(workId,createdAt);
