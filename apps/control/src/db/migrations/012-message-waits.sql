CREATE TABLE message_waits (
  messageId TEXT NOT NULL REFERENCES messages(id),
  recipientId TEXT NOT NULL,
  projectId TEXT NOT NULL REFERENCES projects(id),
  workId TEXT REFERENCES work_items(id),
  runId TEXT REFERENCES runs(id),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','responded','expired','cancelled')),
  deadline INTEGER NOT NULL,
  replyId TEXT REFERENCES messages(id),
  endedAt INTEGER,
  PRIMARY KEY(messageId,recipientId)
);
CREATE INDEX message_wait_deadline ON message_waits(state,deadline);
CREATE INDEX message_wait_work ON message_waits(workId,state);
