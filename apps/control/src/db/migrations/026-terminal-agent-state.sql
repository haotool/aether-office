-- What the agent in a managed terminal is doing, read from the screen when its runner reports it.
ALTER TABLE terminal_sessions ADD COLUMN agentState TEXT;
