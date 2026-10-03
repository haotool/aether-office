import { expect, it } from 'vitest';
import { PUBLIC_ROUTES, createServer } from '../../apps/control/src/server.js';
import { command, fixture } from './fixture.js';

// Public routes are declared once, in the server. Every other route must refuse an unauthenticated
// caller, and every project-scoped route must refuse a credential for a different project.
const SEGMENTS: Record<string, string> = { projectId: '00000000-0000-4000-8000-000000000001' };
const fill = (url: string, projectId: string) =>
  url.replace(/:(\w+)/g, (_m, name: string) =>
    name === 'projectId' ? projectId : '00000000-0000-4000-8000-0000000000aa',
  );

it("every non-public route refuses unauthenticated callers, and project routes refuse another project's credential", async () => {
  const routes: { method: string; url: string }[] = [];
  const f = fixture();
  const app = createServer(f.control, {
    origin: 'http://127.0.0.1:4499',
    a2a: true,
    routeLog: routes,
  });
  try {
    await app.ready();
    const other = String(
      f.control.execute(f.owner.actor, command('project.create', { name: 'Other project' })).result[
        'id'
      ],
    );
    const stranger = f.control.createIdentity(f.owner.actor, {
      name: 'Other operator',
      role: 'operator',
      projectIds: [other],
    });
    const host = { host: '127.0.0.1:4499' };
    const swept = routes.filter(
      (r) => !r.url.startsWith('/*') && r.url !== '/' && !PUBLIC_ROUTES.has(`${r.method} ${r.url}`),
    );
    expect(swept.length).toBeGreaterThan(30); // the sweep must actually cover the API

    const unauthenticated: string[] = [];
    const crossProject: string[] = [];
    for (const { method, url } of swept) {
      if (url.includes('/stream')) continue; // long-lived: covered by the revocation test
      const target = fill(url, f.projectId);
      const anon = await app.inject({
        method: method as 'GET',
        url: target,
        headers: host,
        payload: method === 'GET' ? undefined : {},
      });
      if (![401, 403].includes(anon.statusCode))
        unauthenticated.push(`${method} ${url} -> ${anon.statusCode}`);
      if (url.includes('/projects/:projectId')) {
        const foreign = await app.inject({
          method: method as 'GET',
          url: target,
          headers: { ...host, authorization: `Bearer ${stranger.token}` },
          payload: method === 'GET' ? undefined : {},
        });
        if (![403, 404].includes(foreign.statusCode))
          crossProject.push(`${method} ${url} -> ${foreign.statusCode}`);
      }
    }
    expect(unauthenticated).toEqual([]);
    expect(crossProject).toEqual([]);
    expect(SEGMENTS['projectId']).toBeTruthy();
  } finally {
    await app.close();
    f.control.close();
  }
});
