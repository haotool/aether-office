import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, execute, type Session } from '../api.js';
import { uuid } from '../browser-compat.js';
import {
  CTRL_C,
  ESC,
  SETTLE_MS,
  canSend,
  enqueue,
  nextQueued,
  sanitizeBody,
  sequenceFor,
  type Pending,
} from './composer-model.js';
import { useOutbox, usePending } from './outbox.js';
import {
  heldByOther,
  isNetworkError,
  writeSteps,
  type TerminalControl,
} from './terminal-driver.js';

export type Drive = { terminalId: string; projectId: string };

/** The AETHER terminal a local session runs in, or null when it was not started there (AETHER cannot type into it). */
export function useSessionTerminal(sessionKey: string | null) {
  const query = useQuery({
    queryKey: ['session-terminal', sessionKey],
    queryFn: () =>
      api<{ terminal: Drive | null }>(
        `/api/local-sessions/${encodeURIComponent(sessionKey!)}/terminal`,
      ),
    enabled: !!sessionKey,
    refetchInterval: 8000,
    retry: false,
  });
  return { drive: query.data?.terminal ?? null, loading: query.isLoading };
}

/** False while the browser says it is offline, or the last request could not reach the server (until one can). */
function useReachable() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [reachable, setReachable] = useState(true);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  useEffect(() => {
    if (reachable) return;
    const timer = setInterval(() => {
      api('/api/session').then(
        () => setReachable(true),
        (e) => !isNetworkError(e) && setReachable(true),
      );
    }, 3000);
    return () => clearInterval(timer);
  }, [reachable]);
  return { online: online && reachable, lost: () => setReachable(false) };
}

/**
 * Everything the composer needs to drive a session's terminal: who may write, whose lease it is under, the messages
 * waiting or just sent (kept in the outbox for the transcript to show), and the sends themselves. A message goes in
 * when the network is up, the terminal is not another person's and the session is not working; until then it waits in
 * a bounded queue.
 */
export function useDrive(sessionKey: string, drive: Drive, working: boolean) {
  const me = useQuery({
    queryKey: ['session'],
    queryFn: () => api<Session>('/api/session'),
    staleTime: Infinity,
  });
  const userId = me.data?.actor.id ?? '';
  const canWrite = ['owner', 'operator'].includes(me.data?.actor.role ?? '');
  const control = useQuery({
    queryKey: ['drive-terminal', drive.terminalId],
    queryFn: () =>
      api<TerminalControl>(`/api/projects/${drive.projectId}/terminals/${drive.terminalId}`),
    refetchInterval: 3000,
    retry: false,
  });
  const network = useReachable();
  const pending = usePending(sessionKey);
  const update = useOutbox((s) => s.update);
  const [error, setError] = useState('');
  const [, tick] = useState(0);
  const hold = useRef(0);
  const sending = useRef(false);
  const workingNow = useRef(working);
  workingNow.current = working;

  const running = control.data?.state === 'running';
  const free = !!control.data && running && !heldByOther(control.data, userId, Date.now());
  const mark = useCallback(
    (localId: string, change: Partial<Pending>) =>
      update(sessionKey, (list) =>
        list.map((p) => (p.localId === localId ? { ...p, ...change } : p)),
      ),
    [update, sessionKey],
  );

  const guarded = useCallback(
    async (task: () => Promise<void>) => {
      setError('');
      try {
        await task();
      } catch (e) {
        if (isNetworkError(e)) network.lost();
        else setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
        throw e;
      }
    },
    [network],
  );

  const deliver = useCallback(
    async (item: Pending) => {
      sending.current = true;
      mark(item.localId, { state: 'sending' });
      try {
        await guarded(() =>
          writeSteps(drive.projectId, drive.terminalId, userId, sequenceFor(item.text)),
        );
        hold.current = Date.now() + SETTLE_MS;
        mark(item.localId, { state: 'sent', at: Date.now() });
      } catch (e) {
        // The network dropped: the message goes back to waiting. Anything else is the server's answer: it failed.
        mark(
          item.localId,
          isNetworkError(e)
            ? { state: 'queued' }
            : { state: 'failed', error: e instanceof Error ? e.message : 'REQUEST_FAILED' },
        );
      } finally {
        sending.current = false;
        tick((n) => n + 1);
      }
    },
    [drive, userId, guarded, mark],
  );

  // Flush: the oldest waiting message, whenever the way is clear. A timer re-looks while one waits (the settle gap).
  const waiting = nextQueued(pending);
  useEffect(() => {
    if (!waiting || !canWrite) return;
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [waiting, canWrite]);
  useEffect(() => {
    if (!waiting || sending.current || !canWrite || !userId) return;
    if (
      canSend({ online: network.online, free, working, holdUntil: hold.current, now: Date.now() })
    )
      void deliver(waiting);
  });

  const send = useCallback(
    (text: string): 'queued' | 'full' | 'empty' => {
      if (!sanitizeBody(text).trim()) return 'empty';
      const item: Pending = { localId: uuid(), text, at: Date.now(), state: 'queued' };
      let full = false;
      update(sessionKey, (list) => {
        const next = enqueue(list, item);
        full = next === null;
        return next ?? [...list];
      });
      return full ? 'full' : 'queued';
    },
    [update, sessionKey],
  );

  /** One key or sequence straight into the terminal (Esc, Ctrl+C): never queued, a key is for now or not at all. */
  const sendKey = useCallback(
    (text: string) =>
      guarded(() =>
        writeSteps(drive.projectId, drive.terminalId, userId, [{ text, delayMs: 0 }]),
      ).catch(() => undefined),
    [drive, userId, guarded],
  );

  /** Esc, then Ctrl+C a moment later if it is still working. */
  const interrupt = useCallback(async () => {
    await sendKey(ESC);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    if (workingNow.current) await sendKey(CTRL_C);
  }, [sendKey]);

  const stopProcess = useCallback(async () => {
    await guarded(async () => {
      const now = await api<TerminalControl>(
        `/api/projects/${drive.projectId}/terminals/${drive.terminalId}`,
      );
      await execute(
        'terminal.stop',
        { terminalId: drive.terminalId, epoch: now.controlEpoch },
        drive.projectId,
      );
    }).catch(() => undefined);
  }, [drive, guarded]);

  return {
    canWrite,
    running,
    free,
    online: network.online,
    pending,
    error,
    send,
    sendKey,
    interrupt,
    stopProcess,
  };
}
