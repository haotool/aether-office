import { isOperator } from '../../lib/navigation/roles.js';
/**
 * Pure. What can really be done with a character in the office, from what is known about it: the kind of member, who is
 * asking, whether AETHER runs the session's terminal, whether it is working, whether it is a clock-out candidate. An
 * action that is not possible is not hidden: it is listed disabled with the reason, so the person learns why.
 */
export type CharacterKind = 'managed' | 'observed' | 'subagent';

export type CharacterFacts = {
  kind: CharacterKind;
  /** Who is asking (the session's actor role). */
  role: string;
  /** Observed sessions: the process behind it, and how alive it is. */
  process: 'running' | 'none' | 'unknown' | null;
  liveness: 'active' | 'idle' | 'dormant' | 'orphaned' | 'ended' | 'unknown' | null;
  /** The AETHER terminal the session runs in: none (not started there), free to type into, held by another person, or stopped. */
  drive: 'none' | 'free' | 'held' | 'stopped';
  working: boolean;
  /** A terminal profile exists to continue or fork it in AETHER; false while that is still being looked up. */
  profile: boolean;
  /** Idle long enough, with a process running that the server would stop (see clock-out.ts). */
  clockOut: boolean;
  /** Packing up and walking out. */
  leaving: boolean;
  following: boolean;
  pinned: boolean;
  /** The scene can show another small live view (not a phone, not low quality, not reduced motion). */
  wall: boolean;
};

export const ACTION_IDS = [
  'open',
  'follow',
  'screen',
  'message',
  'continue',
  'replies',
  'copy_resume',
  'fork',
  'interrupt',
  'stop',
  'send_home',
  'pin',
  'feed',
] as const;
export type ActionId = (typeof ACTION_IDS)[number];

export const REASONS = [
  'reasonSubagent',
  'reasonManaged',
  'reasonViewer',
  'reasonOwner',
  'reasonReadOnly',
  'reasonEnded',
  'reasonHeld',
  'reasonWorking',
  'reasonIdle',
  'reasonNoProfile',
  'reasonRunningElsewhere',
  'reasonActive',
  'reasonNoWall',
  'reasonLeaving',
  'reasonTerminalStopped',
] as const;
export type Reason = (typeof REASONS)[number];

export type CharacterAction = {
  id: ActionId;
  enabled: boolean;
  /** Why it is disabled. */
  reason?: Reason;
  /** A toggle that is on (follow, pin). */
  on?: boolean;
};

/** Pure. How `stop` would end the session: the AETHER terminal it runs in, or its process (a forgotten or ownerless one, owner only). */
export function stopRoute(f: CharacterFacts): 'terminal' | 'process' | null {
  if (f.kind !== 'observed') return null;
  if (f.drive === 'free' && isOperator(f.role)) return 'terminal';
  const forgotten =
    f.process === 'running' && (f.liveness === 'dormant' || f.liveness === 'orphaned');
  return forgotten && f.role === 'owner' ? 'process' : null;
}

const sessionlessReason = (f: CharacterFacts): Reason | null =>
  f.kind === 'subagent' ? 'reasonSubagent' : f.kind === 'managed' ? 'reasonManaged' : null;
const hasEnded = (f: CharacterFacts) => f.process === 'none' || f.liveness === 'ended';

/** Why a terminal cannot be typed into right now. */
function typingReason(f: CharacterFacts, sessionless: Reason | null): Reason | null {
  if (sessionless) return sessionless;
  if (!isOperator(f.role)) return 'reasonViewer';
  if (f.drive === 'none') return hasEnded(f) ? 'reasonEnded' : 'reasonReadOnly';
  if (f.drive === 'held') return 'reasonHeld';
  return f.drive === 'stopped' ? 'reasonTerminalStopped' : null;
}

/** Why a session AETHER only watches cannot be continued where AETHER can type. */
function continueReason(f: CharacterFacts): Reason | null {
  if (!isOperator(f.role)) return 'reasonViewer';
  if (!f.profile) return 'reasonNoProfile';
  return f.process === 'running' ? 'reasonRunningElsewhere' : null;
}

function stopReason(f: CharacterFacts, sessionless: Reason | null): Reason | null {
  if (sessionless) return sessionless;
  if (hasEnded(f)) return 'reasonEnded';
  if (stopRoute(f)) return null;
  if (!isOperator(f.role)) return 'reasonViewer';
  if (f.drive === 'held') return 'reasonHeld';
  const forgotten =
    f.process === 'running' && (f.liveness === 'dormant' || f.liveness === 'orphaned');
  return forgotten ? 'reasonOwner' : 'reasonActive';
}

const action = (id: ActionId, reason: Reason | null, on?: boolean): CharacterAction => ({
  id,
  enabled: reason === null,
  ...(reason ? { reason } : {}),
  ...(on === undefined ? {} : { on }),
});

const forkReason = (f: CharacterFacts, sessionless: Reason | null): Reason | null => {
  if (sessionless) return sessionless;
  if (!isOperator(f.role)) return 'reasonViewer';
  return f.profile ? null : 'reasonNoProfile';
};

const typingOrWorking = (typing: Reason | null, working: boolean): Reason | null =>
  typing ?? (working ? 'reasonWorking' : null);

const messageOrContinue = (f: CharacterFacts, typing: Reason | null): CharacterAction =>
  f.kind !== 'observed' || f.drive !== 'none'
    ? action('message', typingOrWorking(typing, f.working))
    : action('continue', continueReason(f));

const stopOrSendHome = (f: CharacterFacts, sessionless: Reason | null): CharacterAction =>
  f.clockOut
    ? action('send_home', f.role === 'owner' ? null : 'reasonOwner')
    : action('stop', stopReason(f, sessionless));

export function actionsFor(f: CharacterFacts): CharacterAction[] {
  const sessionless = sessionlessReason(f);
  const typing = typingReason(f, sessionless);
  return [
    action('open', null),
    action('follow', f.leaving && !f.following ? 'reasonLeaving' : null, f.following),
    action('screen', f.leaving ? 'reasonLeaving' : null),
    messageOrContinue(f, typing),
    action('replies', typingOrWorking(typing, f.working)),
    action('copy_resume', sessionless),
    action('fork', forkReason(f, sessionless)),
    action('interrupt', typing ?? (f.working ? null : 'reasonIdle')),
    stopOrSendHome(f, sessionless),
    action('pin', f.pinned || f.wall ? null : 'reasonNoWall', f.pinned),
    action('feed', null),
  ];
}

type GroupMember = { hasSession: boolean; clockOut: boolean };
type GroupActions = {
  /** Send home: how many of the selection are clock-out candidates; the confirm dialog lists exactly those. */
  sendHome: { count: number; reason?: Reason };
  copy: { count: number };
  pin: { reason?: Reason };
};

/** Pure. What the floating bar offers for several characters at once. */
export function groupActions(
  members: readonly GroupMember[],
  role: string,
  wall: boolean,
): GroupActions {
  const count = members.filter((m) => m.clockOut).length;
  return {
    sendHome: {
      count: role === 'owner' ? count : 0,
      ...(role !== 'owner'
        ? { reason: 'reasonOwner' as const }
        : count === 0
          ? { reason: 'reasonActive' as const }
          : {}),
    },
    copy: { count: members.filter((m) => m.hasSession).length },
    pin: wall ? {} : { reason: 'reasonNoWall' },
  };
}
