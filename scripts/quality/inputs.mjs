import { createHash } from 'node:crypto';

export const ROLE_VARIANCE_PATHS = [
  'evidence/role-variance.json',
  'test-results/role-variance.json',
];

/** @param {{ exists: (f: string) => boolean, read: (f: string) => string }} repo */
export function qualityInputs(repo) {
  const file = ROLE_VARIANCE_PATHS.find((f) => repo.exists(f));
  if (!file) return { 'role-variance': 'absent' };
  const hash = createHash('sha256').update(repo.read(file)).digest('hex').slice(0, 8);
  return { 'role-variance': `present sha256:${hash}` };
}

export function formatQualityInputs(inputs) {
  return Object.entries(inputs)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');
}
