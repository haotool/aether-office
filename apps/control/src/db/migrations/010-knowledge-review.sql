ALTER TABLE knowledge ADD COLUMN updatedAt INTEGER NOT NULL DEFAULT 0;
UPDATE knowledge SET updatedAt=createdAt;
ALTER TABLE knowledge ADD COLUMN reviewedBy TEXT REFERENCES identities(id);
ALTER TABLE knowledge ADD COLUMN reviewReason TEXT;
ALTER TABLE knowledge ADD COLUMN workId TEXT REFERENCES work_items(id);
ALTER TABLE knowledge ADD COLUMN artifactId TEXT REFERENCES artifacts(id);
ALTER TABLE knowledge ADD COLUMN commitSha TEXT;
