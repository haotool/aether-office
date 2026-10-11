import { useEffect, useState } from 'react';
import type { Agent } from '@aether/contracts';
import { SUBAGENT_INFIX } from '../../lib/sessions/subagent-id.js';
import type { Squad, SquadMemberFacts } from '../office/office-model.js';

const params = new URLSearchParams(window.location.search);
const count = Math.min(12, Math.max(0, Number(params.get('squad')) || 0));
const afterMs = Number(params.get('after')) || 0;
const arriveMs = Number(params.get('arrive')) || 0;
const leaveMs = Number(params.get('leave')) || 0;
const toolMs = Number(params.get('tools')) || 0;
const tokensPerMinute = Number(params.get('tokens')) || null;
const lookDesk = params.get('look') === 'desk';
const resultError = params.get('result') === 'error';
export const squadLook = params.has('look');
export const squadRelation = params.get('relation') !== '0';
export const squadStrings = params.get('strings') !== '0';
export const squadHandover = params.get('handover') !== '0';
export const squadLegacy = params.has('legacy');
const GRACE_MS = 90_000;
const TYPES = [
  'Explore',
  'code-reviewer',
  'general-purpose',
  'Plan',
  'test-runner',
  'security-reviewer',
];

const SPECIES = ['cat', 'rabbit', 'bear', 'otter', 'raccoon', 'panda', 'dog', 'fox'] as const;

const standIn = (parent: Agent, n: number): Agent => {
  const name = TYPES[n % TYPES.length];
  const species = SPECIES[n % SPECIES.length];
  if (name === undefined || species === undefined) throw new Error('preview stand-in table empty');
  return {
    id: `${parent.id}${SUBAGENT_INFIX}preview-${n}`,
    projectId: parent.projectId,
    name,
    role: 'subagent of preview',
    provider: 'observe',
    mode: 'observe',
    species,
    color: `hsl(${(n * 47) % 360} 70% 62%)`,
    activity: 'working',
    version: 1,
    createdAt: 0,
    lastSeen: null,
  };
};

const memberStartAt = (n: number, opened: number) =>
  opened + afterMs + (arriveMs ? n * arriveMs : afterMs ? 0 : -1000);

const memberFacts = (
  member: Agent,
  startedAt: number,
  now: number,
  finished: boolean,
  endedAt: number | null,
): SquadMemberFacts => {
  const tools = toolMs ? Math.floor((now - startedAt) / toolMs) : 0;
  return {
    id: member.id,
    type: member.name,
    nickname: null,
    status: finished ? 'finished' : 'running',
    startedAt,
    endedAt: finished ? endedAt : null,
    lastSeen: now,
    toolCount: tools,
    lastTool: tools ? 'Read' : null,
    tokensPerMinute: finished ? null : tokensPerMinute,
    toolAt: tools ? startedAt + tools * toolMs : null,
    result: finished ? { error: resultError } : null,
  };
};

function previewMembers(parent: Agent, opened: number, now: number) {
  const facts: SquadMemberFacts[] = [];
  const live: Agent[] = [];
  for (let n = 0; n < count; n++) {
    const startedAt = memberStartAt(n, opened);
    if (now < startedAt) continue;
    const endedAt = leaveMs ? startedAt + leaveMs : null;
    const finished = endedAt !== null && now >= endedAt;
    if (finished && endedAt !== null && now - endedAt > GRACE_MS) continue;
    const member = standIn(parent, n);
    facts.push(memberFacts(member, startedAt, now, finished, endedAt));
    if (!finished) live.push(member);
  }
  return { facts, live };
}

export function useSquadPreview(
  agents: readonly Agent[],
): { agents: Agent[]; squads: Squad[]; look: string } | null {
  const [opened] = useState(() => Date.now());
  const [seated, setSeated] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSeated(true), 1200);
    return () => clearTimeout(timer);
  }, []);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!count || !(afterMs || arriveMs || leaveMs || toolMs)) return;
    const every = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(every);
  }, []);
  const parent = agents.find((a) => !a.id.includes(SUBAGENT_INFIX));
  if (!count || !parent) return null;
  const { facts, live } = previewMembers(parent, opened, now);
  const middle = live.find((a) => a.id.endsWith(`preview-${Math.floor(count / 2)}`));
  return {
    agents: live,
    squads: [{ supervisor: parent.id, members: facts }],
    look: !seated ? 'overview' : lookDesk ? parent.id : (middle ?? parent).id,
  };
}
