/** A subagent's member id is its supervisor's (`local:<session>`) plus this infix and its own id. */
export const SUBAGENT_INFIX = ':sub:';

/** The supervisor's member id of a subagent's member id. */
export const parentOf = (agentId: string) => agentId.split(SUBAGENT_INFIX)[0] ?? agentId;
