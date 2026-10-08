import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api/api.js';
import { type Session } from '../lib/api/api-session.js';
import { uuid } from '../lib/platform/browser-compat.js';
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
} from '../features/conversation/composer-model.js';
import { useOutbox, usePending } from '../features/conversation/outbox.js';
import {
  heldByOther,
  isNetworkError,
  stopTerminal,
  writeSteps,
  type TerminalControl,
} from '../features/terminal/terminal-driver.js';
import { isOperator } from '../lib/navigation/roles.js';
import { POLL, poll } from '../lib/app/polling.js';

export type Drive = { terminalId: string; projectId: string };

/** The AETHER terminal a local session runs in, or null when it was not started there (AETHER cannot type into it). */
export function useSessionTerminal(sessionKey: string | null) {
  const query = useQuery({
    queryKey: ['session-terminal', sessionKey],
    queryFn: () => {
      if (!sessionKey) throw new Error('session terminal without key');
      return api<{ terminal: Drive | null }>(
        `/api/local-sessions/${encodeURIComponent(sessionKey)}/terminal`,
      );
    },
    enabled: !!sessionKey,
    ...poll(POLL.idle),
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

/** Who may write, and whether the session's terminal is running and not another person's right now. */
function useDriveAccess(drive: Drive) {
  const me = useQuery({
    queryKey: ['session'],
    queryFn: () => api<Session>('/api/session'),
    staleTime: Infinity,
  });
  const userId = me.data?.actor.id ?? '';
  const control = useQuery({
    queryKey: ['drive-terminal', drive.terminalId],
    queryFn: () =>
      api<TerminalControl>(`/api/projects/${drive.projectId}/terminals/${drive.terminalId}`),
    ...poll(POLL.driving),
    retry: false,
  });
  const running = control.data?.state === 'running';
  return {
    userId,
    canWrite: isOperator(me.data?.actor.role),
    running,
    free: !!control.data && running && !heldByOther(control.data, userId, Date.now()),
  };
}

/** The writes that never queue: a key, an interrupt, stopping the process; and the error the last write left. */
function useDirectWrites(
  drive: Drive,
  userId: string,
  working: boolean,
  network: ReturnType<typeof useReachable>,
) {
  const [error, setError] = useState('');
  const workingNow = useRef(working);
  workingNow.current = working;
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
    await guarded(() => stopTerminal(drive.projectId, drive.terminalId)).catch(() => undefined);
  }, [drive, guarded]);
  return { error, guarded, sendKey, interrupt, stopProcess };
}

type Way = { online: boolean; free: boolean; working: boolean; canWrite: boolean; userId: string };

/** Sends one queued message: marks it sending, then sent, back to queued when the network dropped, or failed. */
function useDeliver(
  sessionKey: string,
  drive: Drive,
  userId: string,
  guarded: (task: () => Promise<void>) => Promise<void>,
) {
  const update = useOutbox((s) => s.update);
  const [, tick] = useState(0);
  const hold = useRef(0);
  const sending = useRef(false);
  const mark = useCallback(
    (localId: string, change: Partial<Pending>) =>
      update(sessionKey, (list) =>
        list.map((p) => (p.localId === localId ? { ...p, ...change } : p)),
      ),
    [update, sessionKey],
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
  return { deliver, sending, hold, tick };
}

/** Flush: the oldest waiting message, whenever the way is clear. A timer re-looks while one waits (the settle gap). */
function useFlushQueue(
  sessionKey: string,
  drive: Drive,
  pending: readonly Pending[],
  way: Way,
  guarded: (task: () => Promise<void>) => Promise<void>,
) {
  const { online, free, working, canWrite, userId } = way;
  const { deliver, sending, hold, tick } = useDeliver(sessionKey, drive, userId, guarded);
  const waiting = nextQueued(pending);
  useEffect(() => {
    if (!waiting || !canWrite) return;
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [waiting, canWrite]);
  useEffect(() => {
    if (!waiting || sending.current || !canWrite || !userId) return;
    if (canSend({ online, free, working, holdUntil: hold.current, now: Date.now() }))
      void deliver(waiting);
  });
}

/**
 * Everything the composer needs to drive a session's terminal: who may write, whose lease it is under, the messages
 * waiting or just sent (kept in the outbox for the transcript to show), and the sends themselves. A message goes in
 * when the network is up, the terminal is not another person's and the session is not working; until then it waits in
 * a bounded queue.
 */
export function useDrive(sessionKey: string, drive: Drive, working: boolean) {
  const access = useDriveAccess(drive);
  const network = useReachable();
  const pending = usePending(sessionKey);
  const update = useOutbox((s) => s.update);
  const writes = useDirectWrites(drive, access.userId, working, network);
  useFlushQueue(
    sessionKey,
    drive,
    pending,
    { ...access, online: network.online, working },
    writes.guarded,
  );

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

  return {
    canWrite: access.canWrite,
    running: access.running,
    free: access.free,
    online: network.online,
    pending,
    error: writes.error,
    send,
    sendKey: writes.sendKey,
    interrupt: writes.interrupt,
    stopProcess: writes.stopProcess,
  };
}
