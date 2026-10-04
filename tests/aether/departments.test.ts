import { describe, expect, it } from 'vitest';
import { DEPARTMENTS, ROLE_LABELS, classifySession } from '../../packages/kernel/src/index.js';

describe('classifySession', () => {
  it.each([
    ['Fix flaky Playwright e2e test', 'qa', 'quality'],
    ['Add OAuth token rotation and CSRF checks', 'security', 'quality'],
    ['Review PR 1234 for the billing service', 'review', 'quality'],
    ['Investigate production outage and add alerts', 'sre', 'platform'],
    ['Set up GitHub Actions pipeline and Docker build', 'platform', 'platform'],
    ['Cut release 2.3 and bump version', 'release', 'platform'],
    ['Tune the RAG retrieval and embeddings', 'ml', 'data'],
    ['Write SQL migration for the orders schema', 'data', 'data'],
    ['Polish the responsive CSS for the settings page', 'frontend', 'product'],
    ['Add a REST endpoint for invoices', 'backend', 'product'],
    ['Build the iOS onboarding flow with Swift', 'mobile', 'product'],
    ['Update the README and the getting started guide', 'docs', 'leadership'],
    ['Refactor the module boundaries and write an ADR', 'architect', 'leadership'],
    ['Plan the Q4 roadmap and prioritise the backlog', 'product-manager', 'leadership'],
    ['Research and compare three vector databases', 'research', 'leadership'],
    ['修正前端畫面樣式', 'frontend', 'product'],
    ['調研業界的授權做法', 'security', 'quality'],
    ['部署到測試環境', 'platform', 'platform'],
    // Misreadings found by checking real sessions: provider names, "report" and a fused "CICD".
    ['Exchange nonces with Codex', 'generalist', 'product'],
    ['Report identity', 'generalist', 'product'],
    ['CICD 失敗原因分析', 'platform', 'platform'],
    ['pm-conductor 專案進度', 'product-manager', 'leadership'],
    ['Build a KPI dashboard for signups', 'analytics', 'data'],
  ])('%s → %s', (title, role, department) => {
    expect(classifySession({ title })).toMatchObject({
      role,
      department,
      basis: role === 'generalist' ? 'default' : 'title',
    });
  });

  it('falls back to the branch and repository, and then to an honest default', () => {
    expect(classifySession({ title: null, branch: 'fix/login-csrf', repo: 'web' })).toMatchObject({
      role: 'security',
      basis: 'context',
    });
    expect(classifySession({ title: 'hello', branch: 'main', repo: 'notes' })).toEqual({
      role: 'generalist',
      department: 'product',
      basis: 'default',
      matched: null,
    });
    expect(classifySession({})).toMatchObject({ basis: 'default' });
  });

  it('keeps the organisation consistent: every role belongs to the department that lists it', () => {
    for (const department of DEPARTMENTS)
      for (const role of department.roles) expect(ROLE_LABELS[role].department).toBe(department.id);
    expect(new Set(DEPARTMENTS.map((d) => d.floor)).size).toBe(DEPARTMENTS.length);
    expect(Object.keys(ROLE_LABELS).length).toBeGreaterThanOrEqual(17);
  });
});
