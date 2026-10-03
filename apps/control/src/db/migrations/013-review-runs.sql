ALTER TABLE runs ADD COLUMN purpose TEXT NOT NULL DEFAULT 'implementation' CHECK(purpose IN ('implementation','review'));
ALTER TABLE runs ADD COLUMN reviewHead TEXT;
ALTER TABLE runs ADD COLUMN reviewVersion INTEGER;
ALTER TABLE runs ADD COLUMN reviewBase TEXT;
ALTER TABLE workspaces ADD COLUMN purpose TEXT NOT NULL DEFAULT 'implementation' CHECK(purpose IN ('implementation','review'));
