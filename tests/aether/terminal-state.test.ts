import { describe, expect, it } from 'vitest';
import { terminalAgentState } from '../../packages/kernel/src/index.js';

const BAR = '─'.repeat(40);
const screen = (...lines: string[]) => lines.join('\n');

describe('what an agent in a terminal is doing', () => {
  it('is working while a spinner turns above the input box, in any glyph of its cycle', () => {
    for (const glyph of ['✻', '✶', '·', '*'])
      expect(
        terminalAgentState(screen(`${glyph} Cultivating… (6s · ↓ 174 tokens)`, BAR, '❯', BAR)),
      ).toBe('working');
    expect(terminalAgentState('• Running tests (1m 02s • esc to interrupt)')).toBe('working');
  });

  it('is idle at an empty prompt after a finished turn, and a completion summary is not a spinner', () => {
    expect(
      terminalAgentState(screen('⏺ Done, all green.', '✻ Sautéed for 12s', BAR, '❯', BAR)),
    ).toBe('idle');
    expect(terminalAgentState(screen('codex>'))).toBe('idle');
  });

  it('is waiting when a person has to choose, by the footer or by a question with options', () => {
    expect(
      terminalAgentState(
        screen('Select a model', '  1. Opus', '  2. Sonnet', 'Enter to confirm · Esc to cancel'),
      ),
    ).toBe('waiting');
    expect(
      terminalAgentState(
        screen('Do you want to proceed?', '❯ 1. Yes', '  2. No, and tell Claude what to do', '❯'),
      ),
    ).toBe('waiting');
    expect(terminalAgentState('Allow command `rm -rf build`? (y/n)')).toBe('waiting');
    expect(terminalAgentState('Command Approval Required\n[a] Accept  [d] Decline')).toBe(
      'waiting',
    );
  });

  it('is not fooled by prose that borrows the chrome words', () => {
    expect(
      terminalAgentState(
        screen(
          '⏺ Press Enter to confirm your changes in the editor.',
          '* Waiting for review',
          BAR,
          '❯',
          BAR,
        ),
      ),
    ).toBe('idle');
    expect(terminalAgentState(screen('⏺ ok', BAR, '❯', BAR, '● high · /effort'))).toBe('idle');
    expect(
      terminalAgentState(
        screen('✻ Cooking… (2s)', '⏺ Here is the answer', 'more text', BAR, '❯', BAR),
      ),
    ).toBe('idle');
  });

  it('reads a screen redrawn in place, colors and all', () => {
    const frame = '\x1b[2K\x1b[1A\x1b[38;5;246m✻ Orbiting…\x1b[39m\r\n\x1b[1G❯ \r\n';
    expect(terminalAgentState(frame)).toBe('working');
  });

  it('says unknown for what it does not recognise', () => {
    expect(terminalAgentState('')).toBe('unknown');
    expect(terminalAgentState('$ ls\nfile.txt')).toBe('unknown');
  });
});
