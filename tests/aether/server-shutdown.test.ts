import { it, expect } from 'vitest';
import { createServer as reservePort } from 'node:net';
import { fixture } from './fixture.js';
import { createServer } from '../../apps/control/src/server.js';
it('closes active SSE streams when the control server shuts down', async () => {
  const f = fixture();
  const reservation = reservePort();
  await new Promise<void>((resolve) => reservation.listen(0, '127.0.0.1', resolve));
  const port = (reservation.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) =>
    reservation.close((error) => (error ? reject(error) : resolve())),
  );
  const url = `http://127.0.0.1:${port}`;
  const app = createServer(f.control, { origin: url });
  const abort = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await app.listen({ host: '127.0.0.1', port });
    const response = await fetch(`${url}/api/projects/${f.projectId}/stream?after=0`, {
      headers: { authorization: `Bearer ${f.owner.token}` },
      signal: abort.signal,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    reader = response.body!.getReader();
    expect((await reader.read()).done).toBe(false);
    await Promise.race([
      app.close(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('SSE_PREVENTED_SHUTDOWN')), 700);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    abort.abort();
    await reader?.cancel().catch((error) => {
      if ((error as Error).name !== 'AbortError') throw error;
    });
    await app.close();
    f.control.close();
  }
});
