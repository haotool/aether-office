CREATE TABLE session_usage (
  machineId TEXT NOT NULL REFERENCES machines(id),
  agentId TEXT NOT NULL REFERENCES agents(id),
  provider TEXT NOT NULL,
  providerSessionId TEXT NOT NULL,
  turnId TEXT NOT NULL,
  inputTokens INTEGER NOT NULL,
  outputTokens INTEGER NOT NULL,
  PRIMARY KEY(machineId,agentId,provider,providerSessionId,turnId)
);
INSERT INTO session_usage
SELECT r.machineId,r.agentId,r.provider,r.providerSessionId,u.turnId,MAX(u.inputTokens),MAX(u.outputTokens)
FROM usage_totals u JOIN runs r ON r.id=u.runId
WHERE r.machineId IS NOT NULL AND r.providerSessionId IS NOT NULL
GROUP BY r.machineId,r.agentId,r.provider,r.providerSessionId,u.turnId;
