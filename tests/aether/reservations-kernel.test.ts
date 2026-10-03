import { expect, it } from 'vitest';
import {
  findConflicts,
  normalizePattern,
  patternsOverlap,
} from '../../packages/kernel/src/index.js';

it('normalises and rejects unsafe patterns', () => {
  expect(normalizePattern('./src/a.ts')).toBe('src/a.ts');
  for (const bad of ['', '/etc/passwd', '../x', 'a/../b', 'a\\b', 'C:/x', 'a//b', 'x\0'])
    expect(normalizePattern(bad)).toBeNull();
});

it('detects directory containment and wildcard scope overlap', () => {
  expect(patternsOverlap('src', 'src/a.ts')).toBe(true);
  expect(patternsOverlap('src/**', 'src/deep/x.ts')).toBe(true);
  expect(patternsOverlap('src/*.ts', 'src/a.ts')).toBe(true);
  expect(patternsOverlap('src/a.ts', 'src/b.ts')).toBe(false);
  expect(patternsOverlap('docs/**', 'src/**')).toBe(false);
  expect(patternsOverlap('**', 'anything/here')).toBe(true);
  expect(patternsOverlap('srcx/a', 'src/a')).toBe(false);
});

it('conflicts ignore own, expired and non-overlapping reservations', () => {
  const held = [
    { id: 'r1', ownerId: 'a', patterns: ['src/**'], expiresAt: 100 },
    { id: 'r2', ownerId: 'b', patterns: ['src/x.ts'], expiresAt: 50 },
    { id: 'r3', ownerId: 'c', patterns: ['docs'], expiresAt: 100 },
  ];
  expect(findConflicts(['src/y.ts'], 'z', held, 60)).toEqual([
    { reservationId: 'r1', ownerId: 'a', pattern: 'src/**', requested: 'src/y.ts' },
  ]);
  expect(findConflicts(['src/y.ts'], 'a', held, 60)).toEqual([]);
  expect(findConflicts(['lib/q'], 'z', held, 60)).toEqual([]);
});
