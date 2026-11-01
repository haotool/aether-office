import { describe, expect, it } from 'vitest';
import { screenRoles } from '../../packages/office-scene/src/screen/screens.js';
import { SCREEN_ROLES, screenRoleOf } from '../../packages/office-scene/src/squad/squad-screens.js';

describe('subagent screens', () => {
  it('shows work that fits the kind of subagent', () => {
    expect(screenRoleOf('Explore')).toBe('research');
    expect(screenRoleOf('Plan')).toBe('architect');
    expect(screenRoleOf('code-reviewer')).toBe('review');
    expect(screenRoleOf('test-runner')).toBe('qa');
    expect(screenRoleOf('security-reviewer')).toBe('security');
    expect(screenRoleOf('general-purpose')).toBe('generalist');
  });

  it('gives a custom subagent type one stable picture of its own', () => {
    const first = screenRoleOf('release-notes-writer');
    expect(screenRoleOf('release-notes-writer')).toBe(first);
    expect(SCREEN_ROLES).toContain(first);
  });

  it('only names pictures the screens can paint', () => {
    for (const role of SCREEN_ROLES) expect(screenRoles).toContain(role);
  });
});
