import { createServer } from 'node:net';

export const portFree = (port: number, host: string): Promise<boolean> =>
  new Promise((done) => {
    const probe = createServer().once('error', () => done(false));
    probe.listen(port, host, () => probe.close(() => done(true)));
  });
