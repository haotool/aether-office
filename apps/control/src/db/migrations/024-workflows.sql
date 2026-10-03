CREATE TABLE workflows (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL REFERENCES projects(id),
  template TEXT NOT NULL,
  title TEXT NOT NULL,
  createdBy TEXT NOT NULL REFERENCES identities(id),
  createdAt INTEGER NOT NULL
);
CREATE TABLE workflow_steps (
  workId TEXT PRIMARY KEY REFERENCES work_items(id),
  workflowId TEXT NOT NULL REFERENCES workflows(id),
  role TEXT NOT NULL,
  position INTEGER NOT NULL,
  -- Provider constraints: assignment and review must use these providers when set.
  engineerProvider TEXT,
  reviewerProvider TEXT
);
CREATE INDEX workflow_steps_workflow ON workflow_steps(workflowId,position);
