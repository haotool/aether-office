import { existsSync, readFileSync } from 'node:fs';

/** Directory owners that appear in fixtures and examples, not real people. */
export const PLACEHOLDER_USERS = new Set(
  'a b dev sam alice bob user username you me name example foo bar test tester runner ubuntu node app admin root shared public office someone joe jane john'.split(
    ' ',
  ),
);

const placeholderOnly = (name) => PLACEHOLDER_USERS.has(name.toLowerCase());

/** Built-in generic rules. `accept` rejects false positives; `docsOnly` limits a rule to documentation files. */
export const BUILT_IN_RULES = [
  {
    id: 'user-path',
    severity: 'fail',
    re: /\/Users\/([A-Za-z0-9._-]+)/g,
    accept: (m) => !placeholderOnly(m[1]),
    note: 'absolute macOS home path',
  },
  {
    id: 'user-path',
    severity: 'fail',
    re: /[A-Za-z]:\\{1,4}Users\\{1,4}([A-Za-z0-9._-]+)/g,
    accept: (m) => !placeholderOnly(m[1]),
    note: 'absolute Windows home path',
  },
  {
    id: 'user-path',
    severity: 'fail',
    re: /\/home\/([a-z_][a-z0-9_-]*)\//g,
    accept: (m) => !placeholderOnly(m[1]),
    note: 'absolute Linux home path',
  },
  {
    id: 'hostname',
    severity: 'fail',
    re: /\b[A-Za-z0-9-]+['’]?s-(?:MacBook|iMac|Mac-mini|Mac-Studio|Mac-Pro)[A-Za-z0-9-]*/g,
    note: 'machine host name',
  },
  {
    id: 'hostname',
    severity: 'warn',
    re: /\b[a-z0-9-]+\.(?:local|lan|home\.arpa)\b(?![.\w-])/g,
    accept: (m) => !/^(?:localhost|example|host|my-?host|machine|computer|settings)\./i.test(m[0]),
    docsOnly: true,
    note: 'local network host name in documentation (confirm it is an example)',
  },
  {
    id: 'lan-address',
    severity: 'warn',
    re: /\b(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b/g,
    docsOnly: true,
    note: 'private network address in documentation',
  },
];

export const TOKEN_RULES = [
  { id: 'token', re: /\bAKIA[0-9A-Z]{16}\b/g, note: 'AWS access key id' },
  { id: 'token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g, note: 'GitHub token' },
  { id: 'token', re: /\bgithub_pat_[A-Za-z0-9_]{50,}\b/g, note: 'GitHub fine-grained token' },
  { id: 'token', re: /\bsk-[A-Za-z0-9_-]{32,}\b/g, note: 'API key (sk-)' },
  { id: 'token', re: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g, note: 'Slack token' },
  { id: 'token', re: /\bAIza[0-9A-Za-z_-]{35}\b/g, note: 'Google API key' },
  {
    id: 'token',
    re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g,
    note: 'private key block',
  },
  {
    id: 'token',
    re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    note: 'JWT',
  },
].map((r) => ({ ...r, severity: 'fail', token: true }));

const escapeRegex = (text) => text.replace(/[\\^$.*+?()[\]{}|/-]/g, '\\$&');

/**
 * Parses `.oss-private-patterns`: one pattern per line, `#` comments. A pattern is a case-insensitive literal or
 * `re:<regex>`; an optional ` ==> replacement` gives what history cleanup writes instead (default `REDACTED`).
 */
export function parsePrivatePatterns(text) {
  const rules = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [pattern = '', replacement = 'REDACTED'] = line.split(/\s+==>\s+/).map((s) => s.trim());
    if (!pattern) continue;
    const source = pattern.startsWith('re:') ? pattern.slice(3) : escapeRegex(pattern);
    rules.push({
      id: `private-pattern#${rules.length + 1}`,
      severity: 'fail',
      re: new RegExp(source, 'gi'),
      source,
      replacement,
      private: true,
      note: 'maintainer-private string',
    });
  }
  return rules;
}

export function loadPrivatePatterns(file) {
  return file && existsSync(file) ? parsePrivatePatterns(readFileSync(file, 'utf8')) : [];
}

const REDACT = (text) => (text.length <= 8 ? '***' : `${text.slice(0, 4)}***`);

export function scanText(text, rules, { docs = false } = {}) {
  const findings = [];
  for (const rule of rules) {
    if (rule.docsOnly && !docs) continue;
    for (const m of text.matchAll(rule.re)) {
      if (rule.accept && !rule.accept(m)) continue;
      const line = text.slice(0, m.index).split('\n').length;
      const sample = rule.private
        ? '(private pattern)'
        : rule.token
          ? REDACT(m[0])
          : m[0].slice(0, 60);
      findings.push({ rule: rule.id, severity: rule.severity, note: rule.note, line, sample });
    }
  }
  return findings;
}

export function replaceRules(privateRules) {
  const names = [...PLACEHOLDER_USERS].join('|');
  return [
    { re: String.raw`/Users/(?!(?:${names})\b)[A-Za-z0-9._-]+`, rep: '/Users/dev', literal: true },
    {
      re: String.raw`([A-Za-z]):(\\{1,4})Users\2(?!(?:${names})\b)[A-Za-z0-9._-]+`,
      rep: String.raw`\1:\2Users\2dev`,
      literal: false,
    },
    ...privateRules.map((r) => ({ re: `(?i:${r.source})`, rep: r.replacement, literal: true })),
  ];
}

const BINARY_EXTENSIONS =
  /\.(?:glb|gltf|png|jpe?g|webp|gif|ico|zip|gz|blend1?|woff2?|ttf|otf|wasm|sqlite|mp4|webm|mov|pdf|bin)$/i;
export const isBinaryPath = (file) => BINARY_EXTENSIONS.test(file);
export const isDocPath = (file) =>
  /\.(?:md|mdx|txt|ya?ml)$/i.test(file) || file.startsWith('docs/');
export const looksBinary = (buffer) => buffer.subarray(0, 8000).includes(0);

export function binaryText(buffer) {
  return buffer.toString('latin1').replace(/[^\x20-\x7e\n]+/g, '\n');
}
