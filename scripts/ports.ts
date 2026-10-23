import { createServer } from 'node:net';

/** PORT as a control-plane port (a whole number from 1024 to `max`), or null. */
export const parsePort = (value = '4310', max = 65535): number | null => {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1024 && port <= max ? port : null;
};

export const portFree = (port: number, host: string): Promise<boolean> =>
  new Promise((done) => {
    const probe = createServer().once('error', () => done(false));
    probe.listen(port, host, () => probe.close(() => done(true)));
  });
