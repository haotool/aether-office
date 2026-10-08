import { useEffect, useState } from 'react';
import type { Agent } from '@aether/contracts';
import { SUBAGENT_INFIX } from '../subagent-id.js';
import type { Squad, SquadMemberFacts } from './office-model.js';

// Opt-in preview: `?squad=N` gives the first member a squad of N stand-in subagents, to look at the zone, the pods, the
// beam and the walks without real sessions (a contact sheet and the perf gate use it). Invented on purpose, never shown otherwise.
//   &after=MS   the squad first shows MS after the page opened (to measure the first appearance on a scene already running)
//   &arrive=MS  one subagent joins every MS (they walk in); without it they are all there when the page opens
//   &leave=MS   each subagent finishes MS after it joined (it walks out through the core)
//   &tools=MS   each working subagent starts a tool every MS (the beam's rate)
//   &tokens=N   each working subagent reports N tokens a minute (the beam then follows tokens, not tool calls)
//   &result=error  the finished ones come back flagged as an error (the hand-over stamps RETURNED, never RECEIVED)
//   &look=1     the camera goes to the middle of the squad, up close (once the pods are there); &look=desk to the supervisor's desk
//   &relation=0 the zone's dressing and the beam are off (the setting; to measure what they cost)
//   &strings=0  the puppet strings are off (the setting)
//   &handover=0 the hand-over of a result is off (a finished subagent leaves as before)
//   &legacy=1   the subagents sit at desks of their own, as before squads (the perf gate's baseline)
const params = new URLSearchParams(window.location.search);
const count = Math.min(12, Math.max(0, Number(params.get('squad')) || 0));
const afterMs = Number(params.get('after')) || 0;
const arriveMs = Number(params.get('arrive')) || 0;
const leaveMs = Number(params.get('leave')) || 0;
const toolMs = Number(params.get('tools')) || 0;
const tokensPerMinute = Number(params.get('tokens')) || null;
const lookDesk = params.get('look') === 'desk';
const resultError = params.get('result') === 'error';
/** Whether the camera should go to the squad's supervisor (the page's own focus otherwise). */
export const squadLook = params.has('look');
/** The relation effects switch, as the office-life setting would set it. */
export const squadRelation = params.get('relation') !== '0';
/** The puppet strings switch, as the setting would set it (`&strings=0`; to measure what they cost). */
export const squadStrings = params.get('strings') !== '0';
/** The hand-over switch (`&handover=0`; to measure what it costs, the finished ones just leave). */
export const squadHandover = params.get('handover') !== '0';
/** Whether to seat the stand-in subagents at desks, as before squads existed. */
export const squadLegacy = params.has('legacy');
/** How long a finished subagent stays in the list, as the server keeps it. */
const GRACE_MS = 90_000;
const TYPES = [
  'Explore',
  'code-reviewer',
  'general-purpose',
  'Plan',
  'test-runner',
  'security-reviewer',
];

const standIn = (parent: Agent, n: number): Agent => ({
  id: `${parent.id}${SUBAGENT_INFIX}preview-${n}`,
  projectId: parent.projectId,
  name: TYPES[n % TYPES.length]!,
  role: 'subagent of preview',
  provider: 'observe',
  mode: 'observe',
  species: (['cat', 'rabbit', 'bear', 'otter', 'raccoon', 'panda', 'dog', 'fox'] as const)[n % 8]!,
  color: `hsl(${(n * 47) % 360} 70% 62%)`,
  activity: 'working',
  version: 1,
  createdAt: 0,
  lastSeen: null,
});

/** The stand-in subagents that have joined by `now`: their facts, and the ones still working as members. */
function previewMembers(parent: Agent, opened: number, now: number) {
  const facts: SquadMemberFacts[] = [];
  const live: Agent[] = [];
  for (let n = 0; n < count; n++) {
    const startedAt = opened + afterMs + (arriveMs ? n * arriveMs : afterMs ? 0 : -1000);
    if (now < startedAt) continue;
    const endedAt = leaveMs ? startedAt + leaveMs : null;
    const finished = endedAt !== null && now >= endedAt;
    if (finished && now - endedAt > GRACE_MS) continue;
    const tools = toolMs ? Math.floor((now - startedAt) / toolMs) : 0;
    const member = standIn(parent, n);
    facts.push({
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
    });
    if (!finished) live.push(member);
  }
  return { facts, live };
}

/** The stand-in squad of the first member: its agents (the live ones) and its facts, advancing with the clock. */
export function useSquadPreview(
  agents: readonly Agent[],
): { agents: Agent[]; squads: Squad[]; look: string } | null {
  const [opened] = useState(() => Date.now());
  // The camera needs the pods to exist before it can fly to one: it is told where to look a moment after the squad is seated.
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
  // The camera goes to the middle of the squad once it is there, else to the supervisor.
  const middle = live.find((a) => a.id.endsWith(`preview-${Math.floor(count / 2)}`));
  return {
    agents: live,
    squads: [{ supervisor: parent.id, members: facts }],
    look: !seated ? 'overview' : lookDesk ? parent.id : (middle ?? parent).id,
  };
}
