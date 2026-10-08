import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inputBatcher } from '../../apps/web/src/features/terminal/terminal-input.js';
import { profilesOf } from '../../apps/web/src/features/terminal/terminal-model.js';

// The terminal's typed input: batched for 50 ms, bounded at 8 KiB, sent in order, and disarmed by a refused send.
describe('inputBatcher', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const setup = (enabled = true) => {
    const access = { current: { enabled, epoch: 3 } };
    const sent: [number, string][] = [];
    const send = vi.fn((epoch: number, text: string) => {
      sent.push([epoch, text]);
      return Promise.resolve();
    });
    const on = { onDisarm: vi.fn(), onError: vi.fn() };
    return { access, sent, send, on, batcher: inputBatcher(send, access, on) };
  };

  it('joins what is typed within 50 ms into one send under the current epoch', async () => {
    const { batcher, sent } = setup();
    batcher.push('ls');
    batcher.push(' -la');
    expect(sent).toEqual([]);
    await vi.advanceTimersByTimeAsync(50);
    expect(sent).toEqual([[3, 'ls -la']]);
  });

  it('ignores input while the terminal is not writable', async () => {
    const { batcher, sent } = setup(false);
    batcher.push('x');
    await vi.advanceTimersByTimeAsync(100);
    expect(sent).toEqual([]);
  });

  it('refuses more than 8 KiB in one batch and reports it', async () => {
    const { batcher, sent, on } = setup();
    batcher.push('a'.repeat(8192));
    batcher.push('b');
    expect(on.onError).toHaveBeenCalledWith('PTY_INPUT_LIMIT');
    await vi.advanceTimersByTimeAsync(50);
    expect(sent[0]?.[1]).toHaveLength(8192);
  });

  it('drops a batch whose epoch changed before it was sent', async () => {
    const { batcher, access, sent } = setup();
    batcher.push('late');
    await vi.advanceTimersByTimeAsync(50 - 1);
    access.current = { enabled: true, epoch: 4 };
    await vi.advanceTimersByTimeAsync(1);
    expect(sent).toEqual([[4, 'late']]);
  });

  it('disarms the terminal and reports the error when a send is refused', async () => {
    const { batcher, access, on, send } = setup();
    send.mockRejectedValueOnce(new Error('TERMINAL_NOT_HELD'));
    batcher.push('x');
    await vi.advanceTimersByTimeAsync(50);
    expect(access.current.enabled).toBe(false);
    expect(on.onDisarm).toHaveBeenCalledWith('TERMINAL_NOT_HELD');
  });

  it('sends nothing once disposed', async () => {
    const { batcher, sent } = setup();
    batcher.push('x');
    batcher.dispose();
    await vi.advanceTimersByTimeAsync(100);
    expect(sent).toEqual([]);
  });
});

describe('profilesOf', () => {
  it('lists every profile of every machine, labelled by machine and name', () => {
    const profiles = [
      {
        machineId: 'm1',
        name: 'Mac',
        terminalProfiles: JSON.stringify([{ name: 'zsh' }, { name: 'bash' }]),
      },
      { machineId: 'm2', name: 'Box', terminalProfiles: '[]' },
    ];
    expect(profilesOf(profiles)).toEqual([
      { machineId: 'm1', profile: 'zsh', label: 'Mac · zsh' },
      { machineId: 'm1', profile: 'bash', label: 'Mac · bash' },
    ]);
    expect(profilesOf(undefined)).toEqual([]);
  });
});
