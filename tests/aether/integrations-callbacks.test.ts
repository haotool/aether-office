import { createHmac } from 'node:crypto';
import { expect, it } from 'vitest';
import { seedWork } from './fixture.js';
import { port, setup, state } from './integrations-env.js';

it('posts only accepted results back, tagged so they are recognisable', async () => {
  const t = setup();
  try {
    const { id } = t.github();
    await t.sync(id);
    const work = t.works()[0]!;
    const post = () =>
      t.app.inject({
        method: 'POST',
        url: `/api/projects/${t.f.projectId}/work/${work.id}/post-result`,
        headers: t.headers,
      });
    expect((await post()).json().error.code).toBe('INTEGRATION_REQUIRES_ACCEPTED_WORK');
    seedWork(t.f.control, work.id, "state='completed',result='Fixed in commit abc'");
    expect((await post()).json()).toEqual({ posted: true });
    expect(state.comments).toHaveLength(1);
    expect(state.comments[0]!.url).toBe(
      '/repos/acme/app/issues/' + work.title.match(/#(\d+)/)![1] + '/comments',
    );
    expect(state.comments[0]!.body).toContain('Fixed in commit abc');
    expect(state.comments[0]!.body).toContain(`<!-- aether:work:${work.id} -->`);
  } finally {
    await t.app.close();
    t.f.control.close();
  }
});

it('verifies webhook signatures on the raw body, deduplicates deliveries, and only treats the payload as a signal', async () => {
  const t = setup();
  try {
    const { id } = t.github();
    const payload = JSON.stringify({
      action: 'opened',
      issue: { title: 'ignored: state is pulled, not trusted' },
    });
    const sign = (secret: string) =>
      'sha256=' + createHmac('sha256', secret).update(payload).digest('hex');
    const send = (signature: string, delivery: string, event = 'issues') =>
      t.app.inject({
        method: 'POST',
        url: `/api/webhooks/github/${id}`,
        payload,
        headers: {
          'content-type': 'application/json',
          host: '127.0.0.1:4493',
          'x-hub-signature-256': signature,
          'x-github-delivery': delivery,
          'x-github-event': event,
        },
      });
    expect((await send(sign('wrong'), 'd1')).statusCode).toBe(401);
    expect(t.works()).toHaveLength(0);
    expect((await send(sign('hook-secret'), 'd2')).json()).toEqual({ status: 'synced' });
    expect(t.works().map((w) => w.title)).toEqual(['#1 Fix login', '#2 Add export']); // from the pulled state
    expect((await send(sign('hook-secret'), 'd2')).json()).toEqual({ status: 'duplicate' });
    expect((await send(sign('hook-secret'), 'd3', 'ping')).json()).toEqual({ status: 'ignored' });
  } finally {
    await t.app.close();
    t.f.control.close();
  }
});

it('answers an unknown webhook id like a bad signature and limits how often one address may call it', async () => {
  const t = setup();
  try {
    const { id } = t.github();
    const send = (target: string) =>
      t.app.inject({
        method: 'POST',
        url: `/api/webhooks/github/${target}`,
        payload: '{}',
        headers: { 'content-type': 'application/json', host: '127.0.0.1:4493' },
      });
    expect((await send('nope')).statusCode).toBe(401); // not 404: no oracle for which integrations exist
    expect((await send(id)).statusCode).toBe(401);
    for (let i = 0; i < 118; i++) await send(id);
    expect((await send(id)).statusCode).toBe(429);
  } finally {
    await t.app.close();
    t.f.control.close();
  }
});

it('imports from Linear over GraphQL, surfaces its rate limit, and comments on accepted work', async () => {
  const t = setup();
  try {
    state.linear = [
      {
        id: 'lin-1',
        identifier: 'ENG-7',
        title: 'Speed up CI',
        description: 'Too slow',
        url: 'https://linear.app/x/issue/ENG-7',
        updatedAt: '2026-10-02T00:00:00Z',
      },
    ];
    const { id } = t.connect({
      provider: 'linear',
      teamKey: 'ENG',
      tokenEnv: 'LIN_TOKEN',
      baseUrl: `http://127.0.0.1:${port}`,
    });
    expect((await t.sync(id)).json()).toEqual({ imported: 1, updated: 0, conflicts: 0 });
    expect(state.requests.at(-1)!.auth).toBe('lin_key'); // Linear API keys are sent as-is, not as Bearer
    state.linearRateLimited = true;
    expect((await t.sync(id)).json().error.code).toBe('INTEGRATION_RATE_LIMITED');
    state.linearRateLimited = false;
    t.advance(120_000);
    const work = t.works()[0]!;
    seedWork(t.f.control, work.id, "state='completed',result='Done'");
    expect(
      (
        await t.app.inject({
          method: 'POST',
          url: `/api/projects/${t.f.projectId}/work/${work.id}/post-result`,
          headers: t.headers,
        })
      ).json(),
    ).toEqual({ posted: true });
  } finally {
    await t.app.close();
    t.f.control.close();
  }
});
