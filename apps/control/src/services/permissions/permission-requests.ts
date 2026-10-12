import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { DomainError } from '@aether/kernel';
import type { PermissionRequestView, PermissionState } from '@aether/contracts';
import { redactSecrets } from '../platform/redaction.js';
import { MAX_RULES, MAX_RULE_CHARS } from '@aether/providers/approval-config';
import { cut, summarize } from './permission-summary.js';

const MAX_PENDING = 20;
const MAX_PENDING_PER_SESSION = 5;
const MAX_REMEMBERED = 100;
const CREATES_PER_MINUTE = 60;
const MIN_WAIT_MS = 5_000;
const MAX_WAIT_MS = 120_000;
const KEEP_CLOSED_MS = 5 * 60_000;

type Decision = { behavior: 'allow' | 'deny'; sessionRules: boolean; message?: string };
type Entry = PermissionRequestView & { projectId: string; decision: Decision | null };

type NewRequest = {
  sessionKey: string;
  projectId: string;
  tool: string;
  input: unknown;
  rules: readonly string[];
  waitMs: number;
};

function newEntry(r: NewRequest, t: number): Entry {
  const waitMs = Math.min(MAX_WAIT_MS, Math.max(MIN_WAIT_MS, r.waitMs));
  return {
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
}

function decisionOf(input: {
  decision: 'allow' | 'deny' | 'allow_session';
  message?: string | undefined;
}): Decision {
  return {
    behavior: input.decision === 'deny' ? 'deny' : 'allow',
    sessionRules: input.decision === 'allow_session',
    ...(input.message ? { message: redactSecrets(input.message) } : {}),
  };
}

function waitForChange(
  changed: EventEmitter,
  id: string,
  untilExpiryMs: number,
  ms: number,
): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      changed.off('change', onChange);
      resolve();
    };
    const onChange = (changedId: string) => changedId === id && done();
    const timer = setTimeout(done, Math.max(0, Math.min(ms, untilExpiryMs)) + 5);
    timer.unref();
    changed.on('change', onChange);
  });
}

class PermissionRequests {
  private readonly entries = new Map<string, Entry>();
  private readonly changed = new EventEmitter();
  private readonly created: number[] = [];

  constructor(private readonly now: () => number) {
    this.changed.setMaxListeners(MAX_PENDING * 4);
  }

  private settle(e: Entry, state: PermissionState) {
    e.state = state;
    e.decidedAt = this.now();
    this.changed.emit('change', e.id);
  }
  private sweep() {
    const t = this.now();
    for (const e of this.entries.values()) {
      if (e.state === 'pending' && e.expiresAt <= t) this.settle(e, 'expired');
      else if (e.state !== 'pending' && t - (e.decidedAt ?? t) > KEEP_CLOSED_MS)
        this.entries.delete(e.id);
    }
    for (
      let oldest = this.entries.keys().next();
      this.entries.size > MAX_REMEMBERED && !oldest.done;
      oldest = this.entries.keys().next()
    )
      this.entries.delete(oldest.value);
  }
  private pending() {
    return [...this.entries.values()].filter((e) => e.state === 'pending');
  }
  private need(id: string): Entry {
    this.sweep();
    const e = this.entries.get(id);
    if (!e) throw new DomainError('PERMISSION_REQUEST_NOT_FOUND', 404);
    return e;
  }

  private admit(sessionKey: string): number {
    this.sweep();
    const t = this.now();
    for (
      let first = this.created[0];
      first !== undefined && t - first > 60_000;
      first = this.created[0]
    )
      this.created.shift();
    const open = this.pending();
    if (
      this.created.length >= CREATES_PER_MINUTE ||
      open.length >= MAX_PENDING ||
      open.filter((e) => e.sessionKey === sessionKey).length >= MAX_PENDING_PER_SESSION
    )
      throw new DomainError('PERMISSION_RATE_LIMIT', 429);
    return t;
  }

  checkRate(sessionKey: string): void {
    this.admit(sessionKey);
  }
  create(r: NewRequest): PermissionRequestView {
    const t = this.admit(r.sessionKey);
    this.created.push(t);
    const entry = newEntry(r, t);
    this.entries.set(entry.id, entry);
    this.changed.emit('change', entry.id);
    return view(entry);
  }
  list(): PermissionRequestView[] {
    this.sweep();
    return this.pending().map(view);
  }
  get(id: string): PermissionRequestView {
    return view(this.need(id));
  }
  projectOf(id: string): string {
    return this.need(id).projectId;
  }
  outcome(id: string): { state: PermissionState; decision: Decision | null } {
    const e = this.need(id);
    return { state: e.state, decision: e.decision };
  }
  /** Only a human route calls this. The same answer twice is the same answer; a different one is refused. */
  decide(
    id: string,
    input: { decision: 'allow' | 'deny' | 'allow_session'; message?: string | undefined },
  ): PermissionRequestView {
    const e = this.need(id);
    const decision = decisionOf(input);
    if (decision.sessionRules && !e.sessionRules.length)
      throw new DomainError('SESSION_RULES_NOT_OFFERED', 400);
    if (e.state === 'pending') {
      e.decision = decision;
      this.settle(e, decision.behavior === 'allow' ? 'allowed' : 'denied');
    } else if (JSON.stringify(e.decision) !== JSON.stringify(decision))
      throw new DomainError('PERMISSION_REQUEST_CLOSED', 409);
    return view(e);
  }
  fallback(id: string) {
    const e = this.need(id);
    if (e.state === 'pending') this.settle(e, 'fallback');
    return { state: e.state, decision: e.decision };
  }
  waitFor(id: string, ms: number): Promise<void> {
    const e = this.need(id);
    if (e.state !== 'pending') return Promise.resolve();
    return waitForChange(this.changed, id, e.expiresAt - this.now(), ms);
  }
}

const view = ({ projectId: _p, decision: _d, ...v }: Entry): PermissionRequestView => v;

/**
 * Pending permission requests live in memory, bounded: they only matter while a hook waits. Only `decide`, which only a
 * human route calls, decides one; past the hook's deadline it is `expired` and the terminal prompt takes over.
 */
export const createPermissionRequests = (now: () => number) => new PermissionRequests(now);
