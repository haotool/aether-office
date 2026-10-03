ALTER TABLE approval_decisions ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
CREATE TABLE participants(id TEXT NOT NULL,projectId TEXT NOT NULL REFERENCES projects(id),kind TEXT NOT NULL CHECK(kind IN ('agent','user')),PRIMARY KEY(id,projectId));
INSERT INTO participants SELECT id,projectId,'agent' FROM agents;
CREATE TABLE recipient_deliveries_v3(sequence INTEGER PRIMARY KEY AUTOINCREMENT,messageId TEXT NOT NULL,projectId TEXT NOT NULL,recipientId TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('available','injected','acknowledged','responded','failed','expired','cancelled')),acknowledgedAt INTEGER,attempts INTEGER NOT NULL DEFAULT 0,lastError TEXT,UNIQUE(messageId,recipientId),FOREIGN KEY(messageId,projectId) REFERENCES messages(id,projectId),FOREIGN KEY(recipientId,projectId) REFERENCES participants(id,projectId));
INSERT INTO recipient_deliveries_v3 SELECT * FROM recipient_deliveries;
DROP TABLE recipient_deliveries;
ALTER TABLE recipient_deliveries_v3 RENAME TO recipient_deliveries;
CREATE INDEX deliveries_inbox ON recipient_deliveries(projectId,recipientId,state,sequence);
