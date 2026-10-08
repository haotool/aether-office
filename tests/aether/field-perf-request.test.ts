import { describe, expect, it } from 'vitest';
import { isFieldPerfRequested } from '../../apps/web/src/features/field-perf/is-field-perf-requested.js';

describe('isFieldPerfRequested', () => {
  it.each([
    ['', false],
    ['?perf=1', false],
    ['?perf=30', false],
    ['?perf=60&msaa=0', false],
    ['?fieldperf=0', false],
    ['?fieldperf=true', false],
    ['?fieldperf=1', true],
    ['?perf=1&fieldperf=1', true],
  ] as const)('search %s → %s', (search, expected) => {
    expect(isFieldPerfRequested(search)).toBe(expected);
  });
});
