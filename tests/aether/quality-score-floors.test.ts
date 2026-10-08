import { describe, expect, it } from 'vitest';
import {
  floorProblems,
  parseFloors,
  raiseFloors,
  renderMarkdown,
  renderTable,
  staleness,
} from './quality-score-shared.js';

describe('floors and the committed scorecard', () => {
  const report = (score: number, value = 1, status = 'fail') => ({
    overall: score,
    areas: [
      {
        name: 'structure',
        title: 'Structure',
        score,
        measured: 100,
        rules: [
          {
            id: 'r',
            label: 'R',
            status,
            weight: 10,
            value,
            limit: 0,
            full: 10,
            unit: '',
            penalty: 100 - score,
            details: ['a.ts:1'],
          },
        ],
      },
    ],
  });

  it('only raises floors and fails an area below its floor', () => {
    const floors = parseFloors('{"target":95,"floors":{"structure":80}}');
    expect(raiseFloors(floors, report(70)).floors.structure).toBe(80);
    expect(raiseFloors(floors, report(90)).floors.structure).toBe(90);
    expect(floorProblems(report(70), floors)).toEqual(['structure: 70 is below its floor 80']);
    expect(floorProblems(report(80), floors)).toEqual([]);
    expect(floorProblems(report(80), parseFloors(''))[0]).toContain('no floor recorded');
  });

  it('calls a scorecard stale when a measured rule changed, but not when one was not run', () => {
    expect(staleness(report(90), report(90))).toEqual([]);
    expect(staleness(report(90), report(80, 2))[0]).toContain('structure/r');
    expect(staleness(report(90), report(80, 2, 'skipped'))).toEqual([]);
  });

  it('renders the same text for the same report and lists the largest penalties', () => {
    const floors = parseFloors('{"target":95,"floors":{"structure":80}}');
    expect(renderMarkdown(report(90), floors)).toBe(renderMarkdown(report(90), floors));
    expect(renderMarkdown(report(90), floors)).toContain(
      '| Structure (`structure`) | 90.0 | 80.0 |',
    );
    expect(renderTable(report(90), floors, { target: 95 })).toContain('r: R = 1 (limit 0)');
  });
});
