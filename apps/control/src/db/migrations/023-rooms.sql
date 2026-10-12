CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  createdBy TEXT NOT NULL REFERENCES identities(id),
  createdAt INTEGER NOT NULL,
  UNIQUE(projectId,name)
);
CREATE TABLE room_members (
  roomId TEXT NOT NULL REFERENCES rooms(id),
  memberId TEXT NOT NULL,
  PRIMARY KEY(roomId,memberId)
);
ALTER TABLE messages ADD COLUMN roomId TEXT REFERENCES rooms(id);
CREATE INDEX messages_room ON messages(roomId,createdAt);
