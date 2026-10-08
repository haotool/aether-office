import { safeFetch, type FetchPolicy } from '../platform/safe-fetch.js';

// Provider clients normalise external issues. They never touch the database and never read
// secrets: the caller passes the token for one request. Live verification against the real
// services needs credentials and is tracked separately from these fixture-tested contracts.
export type ExternalIssue = {
  externalId: string;
  reference: string; // "#12" or "ENG-34": shown to humans
  title: string;
  body: string;
  url: string;
  updatedAt: string; // ISO-8601
};

export class RateLimited extends Error {
  constructor(readonly retryAt: number) {
    super('RATE_LIMITED');
  }
}
export class ConnectorError extends Error {
  constructor(readonly code: 'UNAUTHORIZED' | 'NOT_FOUND' | 'UPSTREAM_ERROR' | 'BAD_RESPONSE') {
    super(code);
  }
}

const parse = (body: Buffer): unknown => {
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw new ConnectorError('BAD_RESPONSE');
  }
};

function checkStatus(
  status: number,
  headers: Record<string, string | string[] | undefined>,
  now: number,
) {
  if (status === 401) throw new ConnectorError('UNAUTHORIZED');
  if (status === 404) throw new ConnectorError('NOT_FOUND');
  const remaining = headers['x-ratelimit-remaining'];
  if (status === 429 || (status === 403 && remaining === '0')) {
    const retryAfter = Number(headers['retry-after']);
    const reset = Number(headers['x-ratelimit-reset']);
    const at =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? now + retryAfter * 1000
        : Number.isFinite(reset) && reset > 0
          ? reset * 1000
          : now + 60_000;
    throw new RateLimited(Math.max(at, now + 1000));
  }
  if (status < 200 || status >= 300) throw new ConnectorError('UPSTREAM_ERROR');
}

export type GitHubConfig = { owner: string; repo: string; baseUrl: string };
export type LinearConfig = { teamKey: string; baseUrl: string };

const githubHeaders = (token: string) => ({
  authorization: `Bearer ${token}`,
  accept: 'application/vnd.github+json',
  'x-github-api-version': '2022-11-28',
});

export async function githubIssues(
  config: GitHubConfig,
  token: string,
  since: string | null,
  policy: FetchPolicy,
  now: number,
): Promise<ExternalIssue[]> {
  const query = new URLSearchParams({
    state: 'open',
    sort: 'updated',
    direction: 'asc',
    per_page: '50',
  });
  if (since) query.set('since', since);
  const response = await safeFetch(
    `${config.baseUrl}/repos/${config.owner}/${config.repo}/issues?${query}`,
    policy,
    { headers: githubHeaders(token) },
  );
  checkStatus(response.status, response.headers, now);
  const data = parse(response.body);
  if (!Array.isArray(data)) throw new ConnectorError('BAD_RESPONSE');
  return data
    .filter((i) => i && typeof i === 'object' && !('pull_request' in i)) // the issues API also lists PRs
    .map((i: Record<string, unknown>) => {
      if (
        typeof i['id'] !== 'number' ||
        typeof i['title'] !== 'string' ||
        typeof i['html_url'] !== 'string' ||
        typeof i['updated_at'] !== 'string' ||
        typeof i['number'] !== 'number'
      )
        throw new ConnectorError('BAD_RESPONSE');
      return {
        externalId: String(i['id']),
        reference: `#${i['number']}`,
        title: i['title'],
        body: typeof i['body'] === 'string' ? i['body'] : '',
        url: i['html_url'],
        updatedAt: i['updated_at'],
      };
    });
}

export async function githubComment(
  config: GitHubConfig,
  token: string,
  reference: string,
  body: string,
  policy: FetchPolicy,
  now: number,
): Promise<void> {
  const number = reference.replace(/^#/, '');
  const response = await safeFetch(
    `${config.baseUrl}/repos/${config.owner}/${config.repo}/issues/${number}/comments`,
    policy,
    {
      method: 'POST',
      headers: { ...githubHeaders(token), 'content-type': 'application/json' },
      body: JSON.stringify({ body }),
    },
  );
  checkStatus(response.status, response.headers, now);
}

const LINEAR_ISSUES = `query($team:String!,$after:DateTimeOrDuration){issues(first:50,orderBy:updatedAt,filter:{team:{key:{eq:$team}},updatedAt:{gt:$after},state:{type:{nin:["completed","canceled"]}}}){nodes{id identifier title description url updatedAt}}}`;

export async function linearIssues(
  config: LinearConfig,
  token: string,
  since: string | null,
  policy: FetchPolicy,
  now: number,
): Promise<ExternalIssue[]> {
  const response = await safeFetch(`${config.baseUrl}/graphql`, policy, {
    method: 'POST',
    headers: { authorization: token, 'content-type': 'application/json' },
    body: JSON.stringify({
      query: LINEAR_ISSUES,
      variables: { team: config.teamKey, after: since ?? '1970-01-01T00:00:00Z' },
    }),
  });
  checkStatus(response.status, response.headers, now);
  const data = parse(response.body) as {
    errors?: { extensions?: { code?: string } }[];
    data?: { issues?: { nodes?: Record<string, unknown>[] } };
  };
  if (data.errors?.some((e) => e.extensions?.code === 'RATELIMITED'))
    throw new RateLimited(now + 60_000);
  if (data.errors?.length) throw new ConnectorError('UPSTREAM_ERROR');
  const nodes = data.data?.issues?.nodes;
  if (!Array.isArray(nodes)) throw new ConnectorError('BAD_RESPONSE');
  return nodes.map((n) => {
    if (
      typeof n['id'] !== 'string' ||
      typeof n['identifier'] !== 'string' ||
      typeof n['title'] !== 'string' ||
      typeof n['url'] !== 'string' ||
      typeof n['updatedAt'] !== 'string'
    )
      throw new ConnectorError('BAD_RESPONSE');
    return {
      externalId: n['id'],
      reference: n['identifier'],
      title: n['title'],
      body: typeof n['description'] === 'string' ? n['description'] : '',
      url: n['url'],
      updatedAt: n['updatedAt'],
    };
  });
}

export async function linearComment(
  config: LinearConfig,
  token: string,
  externalId: string,
  body: string,
  policy: FetchPolicy,
  now: number,
): Promise<void> {
  const response = await safeFetch(`${config.baseUrl}/graphql`, policy, {
    method: 'POST',
    headers: { authorization: token, 'content-type': 'application/json' },
    body: JSON.stringify({
      query:
        'mutation($id:String!,$body:String!){commentCreate(input:{issueId:$id,body:$body}){success}}',
      variables: { id: externalId, body },
    }),
  });
  checkStatus(response.status, response.headers, now);
  const data = parse(response.body) as {
    errors?: unknown[];
    data?: { commentCreate?: { success?: boolean } };
  };
  if (data.errors?.length || !data.data?.commentCreate?.success)
    throw new ConnectorError('UPSTREAM_ERROR');
}
