import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api/api.js';
import { type Session } from '../lib/api/api-session.js';
import { uuid } from '../lib/platform/browser-compat.js';
import {
  CTRL_C,
  ESC,
  SETTLE_MS,
  atPrompt,
  canSend,
  enqueue,
  isAwaitingReply,
  nextQueued,
  sanitizeBody,
  sequenceFor,
  type Pending,
  type ScreenState,
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
import { POLL, driveMs, poll, pollBy } from '../lib/app/polling.js';

export type Drive = { terminalId: string; projectId: string };

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

function useDriveTerminal(drive: Drive | null, awaiting: boolean) {
  return useQuery({
    queryKey: ['drive-terminal', drive?.terminalId],
    queryFn: () => {
      if (!drive) throw new Error('drive terminal without a terminal');
      return api<TerminalControl>(`/api/projects/${drive.projectId}/terminals/${drive.terminalId}`);
    },
    enabled: !!drive,
    ...pollBy((data: TerminalControl | undefined) => driveMs(data?.agentState, awaiting)),
    retry: false,
  });
}

export function useTerminalState(sessionKey: string | null, awaiting: boolean): ScreenState {
  const { drive } = useSessionTerminal(sessionKey);
  return useDriveTerminal(drive, awaiting).data?.agentState ?? null;
}

function useDriveAccess(drive: Drive, awaiting: boolean) {
  const me = useQuery({
    queryKey: ['session'],
    queryFn: () => api<Session>('/api/session'),
    staleTime: Infinity,
  });
  const userId = me.data?.actor.id ?? '';
  const control = useDriveTerminal(drive, awaiting);
  const running = control.data?.state === 'running';
  return {
    userId,
    canWrite: isOperator(me.data?.actor.role),
    running,
    free: !!control.data && running && !heldByOther(control.data, userId, Date.now()),
    screen: control.data?.agentState ?? null,
  };
}

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

type Way = {
  online: boolean;
  free: boolean;
  atPrompt: boolean;
  working: boolean;
  canWrite: boolean;
  userId: string;
};

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

function useFlushQueue(
  sessionKey: string,
  drive: Drive,
  pending: readonly Pending[],
  way: Way,
  guarded: (task: () => Promise<void>) => Promise<void>,
) {
  const { online, free, atPrompt: ready, working, canWrite, userId } = way;
  const { deliver, sending, hold, tick } = useDeliver(sessionKey, drive, userId, guarded);
  const waiting = nextQueued(pending);
  useEffect(() => {
    if (!waiting || !canWrite) return;
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [waiting, canWrite]);
  useEffect(() => {
    if (!waiting || sending.current || !canWrite || !userId) return;
    if (
      canSend({ online, free, atPrompt: ready, working, holdUntil: hold.current, now: Date.now() })
    )
      void deliver(waiting);
  });
}

export function useDrive(sessionKey: string, drive: Drive, working: boolean) {
  const pending = usePending(sessionKey);
  const access = useDriveAccess(drive, isAwaitingReply(pending, Date.now()));
  const network = useReachable();
  const update = useOutbox((s) => s.update);
  const busy = working || access.screen === 'working';
  const writes = useDirectWrites(drive, access.userId, busy, network);
  useFlushQueue(
    sessionKey,
    drive,
    pending,
    { ...access, online: network.online, atPrompt: atPrompt(access.screen), working: busy },
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
    busy,
    stuck: !atPrompt(access.screen),
    online: network.online,
    pending,
    error: writes.error,
    send,
    sendKey: writes.sendKey,
    interrupt: writes.interrupt,
    stopProcess: writes.stopProcess,
  };
}
