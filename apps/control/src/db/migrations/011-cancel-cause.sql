ALTER TABLE work_items ADD COLUMN cancelCause TEXT REFERENCES work_items(id);
