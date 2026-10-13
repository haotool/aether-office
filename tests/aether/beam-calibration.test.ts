import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BEAM_REFERENCE, beamIntensity } from '../../packages/office-scene/src/squad/beam-rate.js';

const doc = readFileSync('docs/design/office-life.md', 'utf8');
const number = (text: string) => Number(text.replaceAll(',', ''));

function squadRow(label: string, skip = 1): number[] {
  const row = doc.match(new RegExp(`^\\s*\\| ${label} +\\|([^\\n]*)\\|$`, 'm'));
  expect(row, `${label} is in the calibration table of section 4.4`).not.toBeNull();
  return row![1]!
    .split('|')
    .slice(skip)
    .map((cell) => number(cell.trim()));
}

describe('the beam reference rates are the documented, measured ones', () => {
  it('pins BEAM_REFERENCE to the numbers of section 4.4', () => {
    const line = doc.match(
      /Reference rates \(pinned by[^)]*\): ([\d,]+) tokens\/min and ([\d,]+) tool calls\/min/,
    );
    expect(line, 'the reference rates line is in section 4.4').not.toBeNull();
    expect(BEAM_REFERENCE.tokens).toBe(number(line![1]!));
    expect(BEAM_REFERENCE.tools).toBe(number(line![2]!));
  });

  it('puts a squad median minute at 0.5-0.7 and, on tool calls, the p99 at about 0.95', () => {
    const [, p50, , , , p99] = squadRow('Squad, tool calls');
    const median = beamIntensity({ source: 'tools', perMinute: p50! });
    expect(median).toBeGreaterThanOrEqual(0.5);
    expect(median).toBeLessThanOrEqual(0.7);
    expect(beamIntensity({ source: 'tools', perMinute: p99! })).toBeCloseTo(0.95, 1);
  });

  it('puts the token median at 0.7 and no active minute in a constant glow', () => {
    const [p25, p50, , , , p99] = squadRow('Squad, tokens');
    const at = (perMinute: number) => beamIntensity({ source: 'tokens', perMinute });
    expect(at(p50!)).toBeCloseTo(0.7, 1);
    expect(at(p25!)).toBeLessThan(0.8);
    expect(at(p99!)).toBeLessThan(0.95);
    expect(at(p99!)).toBeGreaterThan(at(p50!));
  });

  it('documents the intensities it quotes', () => {
    const calls = squadRow('Tool calls, ref 24 \\(was 30\\)', 0);
    const tokens = squadRow('Tokens, ref 8,000,000 \\(was 20,000\\)', 0);
    const rates = {
      tools: squadRow('Squad, tool calls'),
      tokens: squadRow('Squad, tokens'),
    };
    rates.tools.forEach((rate, i) =>
      expect(beamIntensity({ source: 'tools', perMinute: rate })).toBeCloseTo(calls[i]!, 1),
    );
    rates.tokens.forEach((rate, i) =>
      expect(beamIntensity({ source: 'tokens', perMinute: rate })).toBeCloseTo(tokens[i]!, 1),
    );
  });
});
