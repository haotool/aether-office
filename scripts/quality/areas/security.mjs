// Area 8: security and privacy gates. Secret scanning, the unauthenticated route table (credential documented, rate
// limit present), no network calls from the shipped web code, and the proxy-trust setting under test.
import { findingLocation, scan, top } from '../lib.mjs';
import { rule, skipped } from '../model.mjs';
import { matching } from '../repo.mjs';

const SERVER = 'apps/control/src/server.ts';
const ROUTE_FILES = /^apps\/control\/src\/(routes\/.*|server)\.ts$/;
const SECURITY_DOC = 'docs/security.md';
const SHIPPED_WEB = /^(apps\/web\/src|packages\/office-scene\/src)\/.*\.(ts|tsx|css)$/;
const RATE_LIMIT_SIGNAL = /_RATE_LIMIT|\b429\b|\battempts\.get\(/;
/** Calls out of the browser to another origin, or to anything but this server. */
export const NETWORK_CALLS = [
  /\bfetch\(\s*[`'"](?:https?:)?\/\//,
  /\bnew\s+(?:WebSocket|EventSource)\(\s*[`'"](?:https?|wss?):/,
  /\bXMLHttpRequest\b|\bsendBeacon\(/,
  /(?:src|href)=["'](?:https?:)?\/\/(?!localhost)/,
  /url\(\s*['"]?(?:https?:)?\/\//,
  /@import\s+(?:url\()?['"]?https?:/,
];

/** Entries of the PUBLIC_ROUTES set: [{ route, line, comment }]. */
export function publicRoutes(serverText) {
  const start = serverText.indexOf('PUBLIC_ROUTES');
  const block = serverText.slice(start, serverText.indexOf(']);', start));
  const routes = [];
  const baseLine = serverText.slice(0, start).split('\n').length;
  block.split('\n').forEach((text, i) => {
    const m = /^\s*'((?:GET|POST|PUT|PATCH|DELETE) [^']+)',?\s*(?:\/\/\s*(.*))?$/.exec(text);
    if (m) routes.push({ route: m[1], line: baseLine + i, comment: m[2] ?? '' });
  });
  return routes;
}

export const routePath = (route) => route.split(' ')[1];

export function routeFindings(repo) {
  const routes = publicRoutes(repo.read(SERVER));
  const doc = repo.read(SECURITY_DOC);
  const code = matching(repo, ROUTE_FILES).map((file) => ({ file, text: repo.read(file) }));
  const undocumented = routes.filter(
    (r) => !r.comment && !doc.includes(routePath(r.route)) && !doc.includes(r.route),
  );
  const unlimited = routes.filter((r) => {
    const owners = code.filter(
      ({ text }) => text.includes(`'${routePath(r.route)}'`) && !text.includes('PUBLIC_ROUTES'),
    );
    return !owners.some(({ text }) => RATE_LIMIT_SIGNAL.test(text));
  });
  return { routes, undocumented, unlimited };
}

const personalOrSecret = (line) => /^(?:fail|warn): \S+ token\b/.test(line);

export function security(repo, { readiness = [] } = {}) {
  const result = (id) => readiness.find((r) => r.id === id);
  const leaks = result('gitleaks-tree');
  const { routes, undocumented, unlimited } = routeFindings(repo);
  const calls = NETWORK_CALLS.flatMap((pattern) =>
    scan(
      repo,
      repo.files.filter((f) => SHIPPED_WEB.test(f)),
      pattern,
    ),
  );
  const tokens = (result('tree-content')?.lines ?? []).filter(personalOrSecret);
  const tests = matching(repo, /^tests\/.*\.ts$/).filter((f) =>
    /parseTrustProxy|AETHER_TRUST_PROXY/.test(repo.read(f)),
  );
  const artifacts = result('tracked-artifacts')?.lines ?? [];
  return [
    leaks
      ? rule({
          id: 'gitleaks',
          label: 'gitleaks findings in the tree',
          weight: 25,
          value: leaks.lines.length,
          full: 3,
          details: leaks.lines,
        })
      : skipped(
          'gitleaks',
          'gitleaks findings in the tree',
          25,
          'not run: the gitleaks binary is not installed',
        ),
    rule({
      id: 'secret-patterns',
      label: 'Token patterns in tracked files',
      weight: 20,
      value: tokens.length,
      full: 3,
      details: top(tokens.map(findingLocation)),
    }),
    rule({
      id: 'web-network',
      label: 'Network calls from shipped web code to other origins',
      weight: 20,
      value: calls.length,
      full: 3,
      details: top(calls),
    }),
    rule({
      id: 'public-credential',
      label: 'Unauthenticated routes with no documented credential',
      weight: 10,
      value: undocumented.length,
      full: 3,
      details: undocumented.map((r) => `${SERVER}:${r.line} ${r.route}`),
    }),
    rule({
      id: 'public-rate-limit',
      label: 'Unauthenticated routes with no rate-limit evidence in their route file',
      weight: 15,
      value: unlimited.length,
      full: 6,
      details: unlimited.map((r) => `${SERVER}:${r.line} ${r.route}`),
      note: `${routes.length} public routes`,
    }),
    rule({
      id: 'trust-proxy',
      label: 'No test covers the trust-proxy setting',
      weight: 5,
      value: tests.length === 0 ? 1 : 0,
      full: 1,
      details: tests.length ? [] : ['no test names parseTrustProxy or AETHER_TRUST_PROXY'],
    }),
    rule({
      id: 'tracked-artifacts',
      label: 'Build output, local data or key material tracked',
      weight: 5,
      value: artifacts.length,
      full: 1,
      details: artifacts,
    }),
  ];
}
