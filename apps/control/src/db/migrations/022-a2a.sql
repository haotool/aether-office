CREATE TABLE a2a_clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tokenHash TEXT NOT NULL UNIQUE,
  projectId TEXT NOT NULL REFERENCES projects(id),
  maxOpen INTEGER NOT NULL CHECK(maxOpen BETWEEN 1 AND 100),
  createdBy TEXT NOT NULL REFERENCES identities(id),
  createdAt INTEGER NOT NULL,
  revokedAt INTEGER
);
CREATE TABLE a2a_tasks (
  taskId TEXT PRIMARY KEY,
  clientId TEXT NOT NULL REFERENCES a2a_clients(id),
  workId TEXT NOT NULL UNIQUE REFERENCES work_items(id),
  contextId TEXT NOT NULL,
  createdAt INTEGER NOT NULL
);
CREATE INDEX a2a_tasks_client ON a2a_tasks(clientId,createdAt);
-- A client's messageId is its idempotency key: a retried SendMessage returns the same task.
CREATE TABLE a2a_messages (
  clientId TEXT NOT NULL REFERENCES a2a_clients(id),
  messageId TEXT NOT NULL,
  taskId TEXT NOT NULL REFERENCES a2a_tasks(taskId),
  PRIMARY KEY(clientId,messageId)
);
