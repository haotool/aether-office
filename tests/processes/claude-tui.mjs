// Synthetic interactive CLI that behaves like a terminal agent in the ways a composer depends on; a fixture, never a
// model. Usage: node claude-tui.mjs --home <dir> --spool <file> [--resume <id> [--fork-session]]. A message containing
// `slow` makes it "work" for a while so an interrupt can be tested; `/model x` is acknowledged.
import { appendFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

if (!process.stdin.isTTY) process.exit(98);
const argv = process.argv.slice(2);
const value = (flag) => argv[argv.indexOf(flag) + 1];
const home = value('--home');
const spool = value('--spool');
const resume = argv.includes('--resume') ? value('--resume') : null;
const sessionId =
  resume && !argv.includes('--fork-session') ? resume : resume ? `${resume}-fork` : randomUUID();
const cwd = process.cwd();
const folder = join(home, '.claude/projects', cwd.replace(/[^A-Za-z0-9]/g, '-'));
const file = join(folder, `${sessionId}.jsonl`);
mkdirSync(folder, { recursive: true });
if (!readdirSync(folder).includes(`${sessionId}.jsonl`))
  writeFileSync(file, JSON.stringify({ type: 'user', cwd }) + '\n');

const hook = (event) =>
  appendFileSync(
    spool,
    JSON.stringify({ at: Date.now(), provider: 'claude', event, sessionId, cwd }) + '\n',
  );
const record = (entry) =>
  appendFileSync(
    file,
    JSON.stringify({ timestamp: new Date().toISOString(), cwd, ...entry }) + '\n',
  );
const user = (text) => record({ type: 'user', message: { role: 'user', content: text } });
const said = (text) =>
  record({
    type: 'assistant',
    message: { role: 'assistant', model: 'claude-fixture-1', content: [{ type: 'text', text }] },
  });

let line = '';
let pasting = false;
let turn = null;
const out = (text) => process.stdout.write(text + '\r\n');
const finish = (text) => {
  turn = null;
  said(text);
  hook('Stop');
  out(`< ${text}`);
};
const interrupt = () => {
  if (!turn) return;
  clearTimeout(turn);
  finish('[interrupted]');
};
const submit = () => {
  const text = line.trim();
  line = '';
  if (!text) return;
  out(`> ${text.replace(/\n/g, ' / ')}`);
  user(text);
  hook('UserPromptSubmit');
  if (text.startsWith('/')) return finish(`command ${text}`);
  turn = setTimeout(
    () => finish(`ECHO: ${text.replace(/\n/g, ' / ')}`),
    /\bslow\b/.test(text) ? 30_000 : 900,
  );
};

hook('SessionStart');
out('FAKE CLAUDE READY');
process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  let rest = chunk;
  while (rest) {
    if (rest.startsWith('\x1b[200~')) ((pasting = true), (rest = rest.slice(6)));
    else if (rest.startsWith('\x1b[201~')) ((pasting = false), (rest = rest.slice(6)));
    else {
      const c = rest[0];
      rest = rest.slice(1);
      if (c === '\x15') line = '';
      else if (c === '\x03' || (c === '\x1b' && !rest)) interrupt();
      else if (c === '\r' && !pasting) submit();
      else if (c === '\r' || c === '\n') line += '\n';
      else if (c >= ' ' || c === '\t') line += c;
    }
  }
});
