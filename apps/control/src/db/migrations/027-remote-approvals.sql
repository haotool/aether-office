-- Remote approvals (default off): one row. The hook's bearer token is kept only as a hash; it can create and read
-- permission requests and can do nothing else.
CREATE TABLE remote_approvals(id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL, tokenHash TEXT, updatedAt INTEGER NOT NULL);
