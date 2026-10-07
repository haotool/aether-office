// The synthetic fixture home of the documentation screenshots: repositories, transcripts, hook records, stand-in processes.
import { execFileSync, spawn } from 'node:child_process';
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  claudeLine,
  codexContext,
  codexCount,
  codexMeta,
  writeLines,
} from '../tests/aether/usage-fixtures.ts';
import { DAY, MIN, NOW, iso } from './docs-screenshots-clock.mjs';
import { SESSIONS } from './docs-screenshots-sessions.mjs';

export const work = realpathSync(mkdtempSync(join(tmpdir(), 'aether-docs-')));
export const home = join(work, 'home');
export const data = join(work, 'data');
export const spool = join(home, 'hook-events.jsonl');
export const pids = [];

const git = (cwd, args, date) =>
  execFileSync(
    'git',
    ['-C', cwd, '-c', 'user.name=Ada Lin', '-c', 'user.email=ada@example.invalid', ...args],
    {
      env: { ...process.env, ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}) },
      stdio: 'ignore',
    },
  );

/** A repository with a believable history: a trunk, three feature branches merged, one still open. */
export function repository(name, branch, commits) {
  const cwd = join(home, 'repos', name);
  mkdirSync(cwd, { recursive: true });
  execFileSync('git', ['init', '-q', '-b', 'main', cwd]);
  let n = 0;
  const commit = (subject, agoDays) => {
    n += 1;
    writeFileSync(join(cwd, `file-${n}.txt`), `${n}\n`); // one file per commit, so a merge never conflicts
    git(cwd, ['add', '-A']);
    git(cwd, ['commit', '-q', '-m', subject], new Date(NOW - agoDays * DAY).toISOString());
  };
  const per = Math.max(1, Math.floor(commits / 5));
  for (let i = 0; i < per; i += 1) commit(`Trunk work ${i + 1}`, 40 - i * 2);
  for (const [feature, started] of [
    ['feat/search', 30],
    ['fix/retry', 20],
    ['feat/export', 10],
  ]) {
    git(cwd, ['checkout', '-q', '-b', feature]);
    for (let i = 0; i < per; i += 1) commit(`${feature}: step ${i + 1}`, started - i);
    git(cwd, ['checkout', '-q', 'main']);
    commit(`Trunk during ${feature}`, started - per);
    git(
      cwd,
      ['merge', '-q', '--no-ff', '-m', `Merge ${feature}`, feature],
      new Date(NOW - (started - per - 1) * DAY).toISOString(),
    );
  }
  if (branch !== 'main') git(cwd, ['checkout', '-q', '-b', branch]);
  for (let i = 0; i < per; i += 1) commit(`${branch}: step ${i + 1}`, 2 - i * 0.2);
  return cwd;
}

export function buildFixture() {
  mkdirSync(join(home, '.aether'), { recursive: true });
  writeFileSync(spool, '');
  const models = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5'];
  for (const s of SESSIONS) {
    const cwd = repository(s.repo, s.branch, s.commits);
    const dir = join(home, '.claude/projects', cwd.replace(/[^A-Za-z0-9]/g, '-'));
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${s.id}.jsonl`);
    // A week of earlier usage (for the KPI dashboard) before the conversation itself.
    const history = [];
    for (let d = 6; d >= 1; d -= 1)
      for (let k = 0; k < 3; k += 1)
        history.push(
          claudeLine(
            `msg_${s.repo}_${d}_${k}`,
            iso(d * DAY - k * 40 * MIN),
            {
              i: 1500 + ((d * 977 + k * 313) % 2400),
              cw: 600,
              cr: Math.round((30_000 + d * 4_000 + k * 6_000) * (0.4 + SESSIONS.indexOf(s) * 0.35)),
              o: 500 + ((d * 211 + k * 97) % 1200),
            },
            { model: models[(d + k) % 3], cwd },
          ),
        );
    writeFileSync(
      file,
      s
        .build(cwd)
        .map((l) => JSON.stringify(l))
        .join('\n') + '\n',
    );
    const earlier = join(dir, `earlier-${s.id}.jsonl`); // finished sessions of the week: only the KPI numbers read them
    writeLines(earlier, history);
    utimesSync(earlier, new Date(NOW - 1 * DAY), new Date(NOW - 1 * DAY));
    const at = new Date(NOW - s.agoMs);
    utimesSync(file, at, at);
    for (const record of s.hooks(s.id, cwd)) appendFileSync(spool, JSON.stringify(record) + '\n');
    // `sleep` named claude, standing in the repository: the scanner finds the process by name and working directory.
    const child = spawn('bash', ['-c', 'exec -a claude sleep 86400'], {
      cwd,
      stdio: 'ignore',
      detached: true,
    });
    child.unref();
    pids.push(child.pid);
  }
  // Claude's subscription windows and one Codex rollout with its own, so the KPI dashboard has both rings.
  writeFileSync(
    join(home, 'claude-hud-usage.json'),
    JSON.stringify({
      timestamp: NOW,
      data: {
        planName: 'Max',
        fiveHour: 31,
        sevenDay: 58,
        fiveHourResetAt: new Date(NOW + 2 * 3_600_000).toISOString(),
        sevenDayResetAt: new Date(NOW + 3 * DAY).toISOString(),
      },
    }),
  );
  const day = new Date(NOW).toISOString().slice(0, 10).replaceAll('-', '/');
  const rollout = join(
    home,
    '.codex/sessions',
    day,
    'rollout-docs-019d0000-0000-7000-8000-0000000000aa.jsonl',
  );
  const repoPath = join(home, 'repos', 'ledger-api');
  const resets = Math.floor(NOW / 1000) + 3 * 3600;
  writeLines(rollout, [
    codexMeta(iso(40 * MIN), repoPath),
    codexContext(iso(39 * MIN), 'gpt-5.5'),
    codexCount(
      iso(30 * MIN),
      { input: 120_000, cached: 90_000, output: 9_000, reasoning: 3_000 },
      { input: 40_000, cached: 30_000, output: 3_000, reasoning: 1_000 },
      true,
    )
      .replace(/"resets_at":4000000000/g, `"resets_at":${resets}`)
      .replace(/"resets_at":4000100000/g, `"resets_at":${resets + 4 * 86400}`),
  ]);
  const old = new Date(NOW - 30 * MIN);
  utimesSync(rollout, old, old);
}
