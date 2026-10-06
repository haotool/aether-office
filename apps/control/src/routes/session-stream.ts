import type { OutgoingHttpHeaders } from 'node:http';
import { homedir } from 'node:os';
import { DomainError } from '@aether/kernel';
import { scanLocalSessions } from '../services/local-sessions.js';
import { createSessionHub, type SessionChange } from '../services/session-changes.js';
import { runningSpeech } from '../services/session-speech.js';
import { requireOperator, type RouteContext } from './context.js';

const SCAN_MS = 2000;
const HEARTBEAT_MS = 20_000;
const MAX_CLIENTS = 16;
/** A client whose socket holds more unsent bytes than this is not keeping up: it is dropped and resumes. */
const MAX_BUFFERED_BYTES = 64 * 1024;
/** How often an open stream re-checks its credential (a logout or a role change ends it). */
const RECHECK_MS = 2000;

/**
 * Server-Sent Events for the local sessions: "session x changed (state, tool, speech, transcript)". Owner and operator
 * only, like the endpoints the page reads afterwards; nothing but the session key and the kind of change is sent.
 */
export function sessionStreamRoutes({ app, actor, options, streams }: RouteContext) {
  const hub = createSessionHub({
    intervalMs: options.sessionStream?.scanMs ?? SCAN_MS,
    scan: async () => {
      const sessions = await scanLocalSessions(
        process.env['AETHER_LOCAL_SESSIONS_HOME'] ?? homedir(),
        Date.now(),
        options.sessionStream?.scanMs ?? SCAN_MS,
      );
      return { sessions, speech: await runningSpeech(sessions) };
    },
  });
  const heartbeatMs = options.sessionStream?.heartbeatMs ?? HEARTBEAT_MS;
  const maxClients = options.sessionStream?.maxClients ?? MAX_CLIENTS;

  app.get<{ Querystring: { after?: string } }>(
    '/api/local-sessions/stream',
    async (request, reply) => {
      requireOperator(actor(request));
      if (process.env['AETHER_LOCAL_SESSIONS'] === 'off')
        throw new DomainError('LOCAL_SESSIONS_OFF', 404);
      if (hub.clients >= maxClients) throw new DomainError('TOO_MANY_STREAMS', 429);
      // EventSource resumes with Last-Event-ID; a client that reconnects by hand passes ?after=.
      const given = Number(request.headers['last-event-id'] ?? request.query.after);
      const after = Number.isSafeInteger(given) && given >= 0 ? given : null;

      reply.hijack();
      reply.raw.writeHead(200, {
        ...(reply.getHeaders() as OutgoingHttpHeaders), // the security headers set for every request
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });
      let closed = false;
      let lastWrite = Date.now();
      const close = () => {
        if (closed) return;
        closed = true;
        streams.delete(close);
        clearInterval(timer);
        subscription.unsubscribe();
        reply.raw.end();
      };
      const write = (chunk: string) => {
        if (closed) return;
        lastWrite = Date.now();
        reply.raw.write(chunk);
        if (reply.raw.writableLength > MAX_BUFFERED_BYTES) close();
      };
      const send = (c: SessionChange) =>
        write(`id: ${c.seq}\nevent: session\ndata: ${JSON.stringify(c)}\n\n`);
      const subscription = hub.subscribe(after, send);
      const timer = setInterval(
        () => {
          try {
            requireOperator(actor(request)); // the exact credential, so a logout or revocation ends the stream
          } catch (error) {
            const code = error instanceof DomainError ? error.code : 'STREAM_ERROR';
            write(`event: fault\ndata: ${JSON.stringify({ code })}\n\n`);
            close();
            return;
          }
          if (Date.now() - lastWrite >= heartbeatMs) write(': heartbeat\n\n');
        },
        Math.min(heartbeatMs, RECHECK_MS),
      );
      timer.unref();
      streams.add(close);
      request.raw.on('close', close);
      reply.raw.on('close', close);
      await subscription.ready; // a page that reads after "hello" never sees less than the baseline the changes are measured from
      write(
        `id: ${subscription.seq}\nevent: hello\ndata: ${JSON.stringify({ seq: subscription.seq })}\n\n`,
      );
      if (subscription.resync)
        write(`event: resync\ndata: ${JSON.stringify({ seq: subscription.seq })}\n\n`);
      for (const change of subscription.replay) send(change);
    },
  );
}
