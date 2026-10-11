import { expect, it } from 'vitest';
import { createServer } from '../../apps/control/src/server.js';
import { redeemInvitation } from '../../apps/control/src/services/remote/invitations.js';
import { command, fixture } from './fixture.js';

it('no credential, invitation, A2A token or provider secret ever lands in the database, events, logs or error responses', async () => {
  const logs: string[] = [];
  const providerSecret = 'ghp_TESTSECRET_never_store_me_0123456789';
  process.env['AETHER_TEST_PROVIDER_TOKEN'] = providerSecret;
  const f = fixture();
  const app = createServer(f.control, {
    origin: 'http://127.0.0.1:4501',
    logger: true,
    logStream: { write: (line: string) => void logs.push(line) },
    a2a: true,
    connectors: { env: { AETHER_TEST_PROVIDER_TOKEN: providerSecret } },
  });
  const secrets: Record<string, string> = {
    owner: f.owner.token,
    agent: f.sender.token,
    provider: providerSecret,
  };
  const responses: string[] = [];
  try {
    const host = { host: '127.0.0.1:4501' };
    const send = async (
      method: 'GET' | 'POST',
      url: string,
      headers: Record<string, string>,
      payload?: unknown,
    ) => {
      const res = await app.inject({
        method,
        url,
        headers: { ...host, ...headers },
        ...(payload === undefined ? {} : { payload: payload as never }),
      });
      responses.push(res.body);
      return res;
    };

    await send(
      'POST',
      '/api/login',
      { 'content-type': 'application/json' },
      { token: f.owner.token },
    );
    const wrong = 'wrong-token-' + 'x'.repeat(30);
    await send('POST', '/api/login', { 'content-type': 'application/json' }, { token: wrong });
    secrets['wrongLogin'] = wrong;
    await send('GET', `/api/projects/${f.projectId}/snapshot`, {
      authorization: `Bearer ${f.sender.token}`,
    });

    const invitation = f.control.execute(
      f.owner.actor,
      command('machine.invite', { name: 'm', providers: ['demo'], roots: ['/srv'] }, f.projectId),
    ).result as { token: string };
    secrets['invitation'] = invitation.token;
    secrets['runner'] = redeemInvitation(f.control.ctx, invitation.token).token;
    secrets['a2a'] = (
      f.control.execute(
        f.owner.actor,
        command('a2a.client.create', { name: 'remote', maxOpen: 3 }, f.projectId),
      ).result as { token: string }
    ).token;
    const connection = f.control.execute(
      f.owner.actor,
      command(
        'integration.connect',
        {
          provider: 'github',
          owner: 'acme',
          repo: 'app',
          tokenEnv: 'AETHER_TEST_PROVIDER_TOKEN',
          baseUrl: 'https://127.0.0.1:1',
        },
        f.projectId,
      ),
    ).result as { id: string };
    await send('POST', `/api/projects/${f.projectId}/integrations/${connection.id}/sync`, {
      authorization: `Bearer ${f.owner.token}`,
    });
    await send('GET', `/api/projects/${f.projectId}/integrations`, {
      authorization: `Bearer ${f.owner.token}`,
    });
    await send(
      'POST',
      '/a2a',
      { authorization: `Bearer ${secrets['a2a']}`, 'content-type': 'application/json' },
      { jsonrpc: '2.0', id: 1, method: 'ListTasks', params: {} },
    );

    // Request logging is off by design; log a request-shaped object to prove headers never reach the log.
    secrets['probe'] = 'Bearer probe-secret-value-1234567890';
    app.log.info(
      {
        req: {
          headers: {
            authorization: secrets['probe'],
            cookie: 'aether_session=probe-cookie-value-123456',
          },
        },
      },
      'probe',
    );
    secrets['probeCookie'] = 'probe-cookie-value-123456';

    const sql = f.control.ctx.sqlite;
    const tables = (
      sql.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
    ).map((t) => t.name);
    const database = tables
      .map((t) => JSON.stringify(sql.prepare(`SELECT * FROM "${t}"`).all()))
      .join('\n');
    await app.close();
    const everything = { database, logs: logs.join(''), responses: responses.join('\n') };
    for (const [place, text] of Object.entries(everything))
      for (const [name, secret] of Object.entries(secrets))
        expect(text.includes(secret), `${name} secret found in ${place}`).toBe(false);

    expect(everything.database).toContain('AETHER_TEST_PROVIDER_TOKEN');
    expect(everything.logs).toContain('"msg":"probe"');
    expect(everything.responses).toContain('AUTH_REQUIRED');
  } finally {
    delete process.env['AETHER_TEST_PROVIDER_TOKEN'];
    f.control.close();
  }
}, 30000);
