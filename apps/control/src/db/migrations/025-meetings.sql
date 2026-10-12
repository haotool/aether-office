CREATE TABLE meetings (
  threadId TEXT PRIMARY KEY,
  projectId TEXT NOT NULL REFERENCES projects(id),
  roomId TEXT NOT NULL REFERENCES rooms(id),
  topic TEXT NOT NULL,
  maxRounds INTEGER NOT NULL CHECK(maxRounds BETWEEN 2 AND 12),
  deadlineAt INTEGER NOT NULL,
  createdBy TEXT NOT NULL REFERENCES identities(id),
  concludedAt INTEGER,
  knowledgeId TEXT REFERENCES knowledge(id)
);
