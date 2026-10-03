CREATE TABLE integration_connections (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL REFERENCES projects(id),
  provider TEXT NOT NULL CHECK(provider IN ('github','linear')),
  config TEXT NOT NULL CHECK(json_valid(config)),
  enabled INTEGER NOT NULL DEFAULT 1,
  cursor TEXT,
  backoffUntil INTEGER,
  lastSyncAt INTEGER,
  lastError TEXT,
  createdBy TEXT NOT NULL REFERENCES identities(id),
  version INTEGER NOT NULL DEFAULT 1,
  createdAt INTEGER NOT NULL
);
CREATE TABLE external_links (
  connectionId TEXT NOT NULL REFERENCES integration_connections(id),
  externalId TEXT NOT NULL,
  projectId TEXT NOT NULL REFERENCES projects(id),
  workId TEXT NOT NULL REFERENCES work_items(id),
  url TEXT NOT NULL,
  contentHash TEXT NOT NULL,
  externalUpdatedAt TEXT NOT NULL,
  conflict INTEGER NOT NULL DEFAULT 0,
  pendingHash TEXT,
  PRIMARY KEY(connectionId,externalId)
);
CREATE INDEX external_links_work ON external_links(workId);
CREATE TABLE webhook_deliveries (
  connectionId TEXT NOT NULL REFERENCES integration_connections(id),
  deliveryId TEXT NOT NULL,
  receivedAt INTEGER NOT NULL,
  PRIMARY KEY(connectionId,deliveryId)
);
