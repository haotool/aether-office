import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { DomainError } from '@aether/kernel';
import type { PermissionRequestView, PermissionState } from '@aether/contracts';
import { redactSecrets } from './redaction.js';
import { MAX_RULES, MAX_RULE_CHARS } from '@aether/providers/approval-config';
import { cut, summarize } from './permission-summary.js';

const MAX_PENDING = 20;
const MAX_PENDING_PER_SESSION = 5;
export const MAX_REMEMBERED = 100;
const CREATES_PER_MINUTE = 60;
const MIN_WAIT_MS = 5_000;
const MAX_WAIT_MS = 120_000;
/** A closed request stays readable this long, so a hook that polls a moment late still gets its answer. */
const KEEP_CLOSED_MS = 5 * 60_000;

export type Decision = { behavior: 'allow' | 'deny'; sessionRules: boolean; message?: string };
type Entry = PermissionRequestView & { projectId: string; decision: Decision | null };

type NewRequest = {
  sessionKey: string;
  projectId: string;
  tool: string;
  input: unknown;
  rules: readonly string[];
  waitMs: number;
};

/**
 * Pending permission requests, in memory and bounded: they only matter while a hook is waiting for an answer, so
 * nothing is persisted. A request is never decided by anything but `decide`, which only a human route calls; once the
 * hook's deadline passes it is `expired` and the terminal prompt has taken over.
 */
export function createPermissionRequests(now: () => number) {
  const entries = new Map<string, Entry>();
  const changed = new EventEmitter();
  changed.setMaxListeners(MAX_PENDING * 4);
  const created: number[] = [];

  const view = ({ projectId: _p, decision: _d, ...v }: Entry): PermissionRequestView => v;
  const settle = (e: Entry, state: PermissionState) => {
    e.state = state;
    e.decidedAt = now();
    changed.emit('change', e.id);
  };
  /** Expires what is overdue and forgets what has been closed for long; called before every read. */
  function sweep() {
    const t = now();
    for (const e of entries.values()) {
      if (e.state === 'pending' && e.expiresAt <= t) settle(e, 'expired');
      else if (e.state !== 'pending' && t - (e.decidedAt ?? t) > KEEP_CLOSED_MS)
        entries.delete(e.id);
    }
    while (entries.size > MAX_REMEMBERED) entries.delete(entries.keys().next().value!);
  }
  const pending = () => [...entries.values()].filter((e) => e.state === 'pending');
  const need = (id: string): Entry => {
    sweep();
    const e = entries.get(id);
    if (!e) throw new DomainError('PERMISSION_REQUEST_NOT_FOUND', 404);
    return e;
  };

  /** Throws when another request may not be created now; returns the time it was checked at. */
  function admit(sessionKey: string): number {
    sweep();
    const t = now();
    while (created.length && t - created[0]! > 60_000) created.shift();
    const open = pending();
    if (
      created.length >= CREATES_PER_MINUTE ||
      open.length >= MAX_PENDING ||
      open.filter((e) => e.sessionKey === sessionKey).length >= MAX_PENDING_PER_SESSION
    )
      throw new DomainError('PERMISSION_RATE_LIMIT', 429);
    return t;
  }

  return {
    /** The limits alone, so a caller can refuse before it does anything expensive for a request that would be refused. */
    checkRate: (sessionKey: string) => void admit(sessionKey),
    create(r: NewRequest): PermissionRequestView {
      const t = admit(r.sessionKey);
      created.push(t);
      const waitMs = Math.min(MAX_WAIT_MS, Math.max(MIN_WAIT_MS, r.waitMs));
      const entry: Entry = {
        id: randomUUID(),
        sessionKey: r.sessionKey,
        projectId: r.projectId,
        tool: redactSecrets(r.tool).slice(0, 80),
        ...summarize(r.tool, r.input),
        sessionRules: r.rules
          .slice(0, MAX_RULES)
          .map((rule) => cut(redactSecrets(rule), MAX_RULE_CHARS)),
        createdAt: t,
        expiresAt: t + waitMs,
        state: 'pending',
        decidedAt: null,
        decision: null,
      };
      entries.set(entry.id, entry);
      changed.emit('change', entry.id);
      return view(entry);
    },
    list(): PermissionRequestView[] {
      sweep();
      return pending().map(view);
    },
    get: (id: string) => view(need(id)),
    projectOf: (id: string) => need(id).projectId,
    /** The answer a human gave, or null while there is none. */
    outcome(id: string): { state: PermissionState; decision: Decision | null } {
      const e = need(id);
      return { state: e.state, decision: e.decision };
    },
    /** Only a human route calls this. The same answer twice is the same answer; a different one is refused. */
    decide(
      id: string,
      input: { decision: 'allow' | 'deny' | 'allow_session'; message?: string | undefined },
    ): PermissionRequestView {
      const e = need(id);
      const decision: Decision = {
        behavior: input.decision === 'deny' ? 'deny' : 'allow',
        sessionRules: input.decision === 'allow_session',
        ...(input.message ? { message: redactSecrets(input.message) } : {}),
      };
      if (decision.sessionRules && !e.sessionRules.length)
        throw new DomainError('SESSION_RULES_NOT_OFFERED', 400);
      if (e.state === 'pending') {
        e.decision = decision;
        settle(e, decision.behavior === 'allow' ? 'allowed' : 'denied');
      } else if (JSON.stringify(e.decision) !== JSON.stringify(decision))
        throw new DomainError('PERMISSION_REQUEST_CLOSED', 409);
      return view(e);
    },
    /** The hook gave up (its deadline, or it could not keep waiting): Claude asks in the terminal. */
    fallback(id: string) {
      const e = need(id);
      if (e.state === 'pending') settle(e, 'fallback');
      return { state: e.state, decision: e.decision };
    },
    /** Resolves when the request leaves `pending`, or after `ms`; never rejects. */
    waitFor(id: string, ms: number): Promise<void> {
      const e = need(id);
      if (e.state !== 'pending') return Promise.resolve();
      return new Promise((resolve) => {
        const done = () => {
          clearTimeout(timer);
          changed.off('change', onChange);
          resolve();
        };
        const onChange = (changedId: string) => changedId === id && done();
        const timer = setTimeout(done, Math.max(0, Math.min(ms, e.expiresAt - now())) + 5);
        timer.unref();
        changed.on('change', onChange);
      });
    },
  };
}
