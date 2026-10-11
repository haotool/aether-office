import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { terminalSnapshotSchema } from '@aether/contracts';
import { execute } from '../../lib/api/api-commands.js';
import { useLatest } from '../../hooks/use-latest.js';
import { inputBatcher } from './terminal-input.js';
import type { TerminalAccess } from './terminal-model.js';

export function useXterm(
  projectId: string,
  id: string,
  access: { current: TerminalAccess },
  onDisarm: (message: string) => void,
  onError: (message: string) => void,
) {
  const report = useLatest({ onDisarm, onError });
  const host = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const cursor = useRef(0);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const term = new Terminal({
      cols: 80,
      rows: 24,
      scrollback: 1000,
      disableStdin: true,
      screenReaderMode: true,
      fontSize: 13,
      theme: { background: '#101923', foreground: '#edf2f7' },
    });
    terminal.current = term;
    term.open(element);
    term.textarea?.setAttribute('aria-label', 'PTY input');
    // Terminal output cannot request clipboard access. No link-opening addon is loaded.
    const clipboard = term.parser.registerOscHandler(52, () => true);
    const batcher = inputBatcher(
      (epoch, text) => execute('terminal.input', { terminalId: id, epoch, text }, projectId),
      access,
      {
        onDisarm: (message) => report.current.onDisarm(message),
        onError: (message) => report.current.onError(message),
      },
    );
    const input = term.onData(batcher.push);
    return () => {
      batcher.dispose();
      input.dispose();
      clipboard.dispose();
      term.dispose();
      terminal.current = null;
      cursor.current = 0;
    };
  }, [projectId, id, access, report]);
  return { host, terminal, cursor };
}

export function useSnapshotSync(
  snapshotText: string | null | undefined,
  screen: Pick<ReturnType<typeof useXterm>, 'terminal' | 'cursor'>,
  on: {
    exit: (exit: { exitCode: number; signal: number | null } | null) => void;
    gap: () => void;
    error: (message: string) => void;
  },
) {
  const { terminal, cursor } = screen;
  const latest = useRef(on);
  latest.current = on;
  useEffect(() => {
    const term = terminal.current;
    if (!snapshotText || !term) return;
    try {
      const snapshot = terminalSnapshotSchema.parse(JSON.parse(snapshotText));
      latest.current.exit(snapshot.exit);
      const first = snapshot.chunks[0]?.seq ?? snapshot.cursor + 1;
      if (cursor.current > snapshot.cursor || cursor.current < first - 1) {
        term.reset();
        cursor.current = 0;
        latest.current.gap();
      }
      if (snapshot.gap) latest.current.gap();
      term.resize(snapshot.dimensions.cols, snapshot.dimensions.rows);
      for (const chunk of snapshot.chunks) if (chunk.seq > cursor.current) term.write(chunk.data);
      cursor.current = snapshot.cursor;
    } catch {
      latest.current.error('TERMINAL_SNAPSHOT_INVALID');
    }
  }, [snapshotText, terminal, cursor]);
}
