import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  GRANTS,
  authorize,
  type Action,
  type Actor,
  type Role,
} from '../../packages/kernel/src/index.js';

// The intended policy, written out. Changing a grant has to be a deliberate edit here too.
const OWNER_ONLY: Action[] = [
  'project.execution.configure',
  'project.create',
  'work.extend',
  'work.review',
  'work.verify',
  'work.accept',
  'work.integrate',
  'identity.manage',
  'knowledge.approve',
  'machine.invite',
  'a2a.client.create',
  'a2a.client.revoke',
  'integration.connect',
  'integration.toggle',
  'skill.import',
  'skill.toggle',
];
const EXPECTED: Record<Exclude<Role, 'owner' | 'operator'>, Action[]> = {
  viewer: ['read'],
  reviewer: [
    'read',
    'workspace.diff',
    'work.review',
    'work.comment',
    'message.send',
    'message.ack',
    'knowledge.propose',
  ],
  agent: [
    'read',
    'work.create',
    'work.claim',
    'work.progress',
    'work.submit',
    'message.send',
    'message.ack',
    'knowledge.propose',
    'reservation.acquire',
    'reservation.renew',
    'reservation.release',
  ],
  runner: ['read', 'runner.report', 'work.verify'],
};

const actor = (role: Role, projects: string[] = ['p1']): Actor => ({
  id: 'x',
  role,
  projectIds: projects,
});
const allowed = (role: Role) => ACTIONS.filter((a) => GRANTS[role].includes(a));

describe('authorization matrix', () => {
  it.each(Object.keys(EXPECTED) as (keyof typeof EXPECTED)[])(
    '%s may do exactly what is intended',
    (role) => {
      expect([...allowed(role)].sort()).toEqual([...EXPECTED[role]].sort());
    },
  );

  it('operator may do everything except the owner-only decisions; owner may do everything but runner reporting', () => {
    expect(ACTIONS.filter((a) => !GRANTS.operator.includes(a)).sort()).toEqual(
      [...OWNER_ONLY, 'runner.report'].sort(),
    );
    expect(ACTIONS.filter((a) => !GRANTS.owner.includes(a))).toEqual(['runner.report']);
  });

  it('no non-human role can approve, accept, integrate, configure execution, or manage identities and credentials', () => {
    const sensitive: Action[] = [
      'approval.decide',
      'work.accept',
      'work.integrate',
      'project.execution.configure',
      'identity.manage',
      'machine.invite',
      'a2a.client.create',
      'integration.connect',
      'knowledge.approve',
      'skill.toggle',
    ];
    for (const role of ['viewer', 'reviewer', 'agent', 'runner'] as const)
      for (const action of sensitive)
        expect(() => authorize(actor(role), action), `${role} ${action}`).toThrow('FORBIDDEN');
  });

  it('every grant also respects project scope', () => {
    for (const role of ['owner', 'operator', 'reviewer', 'viewer', 'agent', 'runner'] as const) {
      expect(() => authorize(actor(role, ['p1']), 'read', 'p2'), role).toThrow('PROJECT_FORBIDDEN');
      expect(() => authorize(actor(role, ['p1']), 'read', 'p1'), role).not.toThrow();
    }
    expect(() => authorize(actor('owner', ['*']), 'read', 'anything')).not.toThrow(); // wildcard is for the local owner only by construction
  });
});
