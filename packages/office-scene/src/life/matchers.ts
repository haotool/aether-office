import type { CommandTag } from '@aether/contracts';
import type { LifeSignal } from './signals.js';

// What the hook receiver keeps of a command is its first word, plus a plain subcommand after a launcher such as git or
// pnpm (packages/providers/src/hook-receiver.mjs): "pnpm test", "git push", "vim". These read that and nothing more, so
// they say what a command was started as, never how it ended.
const TESTS = new Set([
  'pnpm test',
  'npm test',
  'yarn test',
  'bun test',
  'cargo test',
  'go test',
  'vitest',
  'jest',
  'pytest',
]);
const INSTALLS = new Set([
  'pnpm install',
  'pnpm i',
  'pnpm add',
  'npm install',
  'npm i',
  'npm ci',
  'yarn install',
  'yarn add',
  'yarn',
  'bun install',
  'bun add',
]);
const EDITORS = new Set(['vim', 'vi', 'nvim']);
const QA_HOSTS = ['stackoverflow.com', 'superuser.com', 'stackexchange.com'];

const bash = (s: LifeSignal) => s.kind === 'tool.start' && s.tool === 'Bash' && !!s.target;

export const isTestRun = (s: LifeSignal) => bash(s) && TESTS.has(s.target!);
export const isInstall = (s: LifeSignal) => bash(s) && INSTALLS.has(s.target!);
export const isVim = (s: LifeSignal) => bash(s) && EDITORS.has(s.target!);
export const isQaSite = (s: LifeSignal) =>
  s.kind === 'tool.start' &&
  s.tool === 'WebFetch' &&
  !!s.target &&
  QA_HOSTS.some((host) => s.target === host || s.target!.endsWith(`.${host}`));

// Since I7 the hook receiver labels a call from a closed vocabulary (`tags`) and the provider's own exit status reaches
// `ok`. A rule that claims how a command ended reads `ok === true` or `ok === false` here: an unknown outcome (null or
// absent) matches nothing, so no outcome effect can start from a guess.
const tagged = (s: LifeSignal, ...tags: CommandTag[]) => !!s.tags?.some((t) => tags.includes(t));
const started = (s: LifeSignal, ...tags: CommandTag[]) =>
  s.kind === 'tool.start' && tagged(s, ...tags);
const ended = (s: LifeSignal, ok: boolean, ...tags: CommandTag[]) =>
  s.kind === 'tool.end' && s.ok === ok && tagged(s, ...tags);

export const testsPassed = (s: LifeSignal) => ended(s, true, 'test');
export const testsFailed = (s: LifeSignal) => ended(s, false, 'test');
/** `ok` here is the watch command's own exit status: `gh run watch` exits 0 without `--exit-status`, whatever the run did. */
export const ciWatched = (s: LifeSignal) =>
  ended(s, true, 'ci.watch') || ended(s, false, 'ci.watch');
export const buildFailed = (s: LifeSignal) => ended(s, false, 'build', 'typecheck');
export const pushed = (s: LifeSignal) => ended(s, true, 'git.push') && !tagged(s, 'git.push.force');
export const forcePushStarted = (s: LifeSignal) => started(s, 'git.push.force');
export const conflictsAppeared = (s: LifeSignal) =>
  s.kind === 'git.conflicts' || started(s, 'git.conflict.marker');
export const deployStarted = (s: LifeSignal) => started(s, 'deploy', 'publish', 'release');
export const rmRecursive = (s: LifeSignal) => started(s, 'fs.rm.recursive');
export const sudoStarted = (s: LifeSignal) => started(s, 'sudo');
export const curlPiped = (s: LifeSignal) => started(s, 'curl.pipe');
export const hardReset = (s: LifeSignal) => started(s, 'git.reset.hard');
export const todoSearch = (s: LifeSignal) => started(s, 'search.todo');
export const prApproved = (s: LifeSignal) => ended(s, true, 'gh.pr.approve');

/** Friday from this hour on is "Friday afternoon". */
export const FRIDAY_FROM_HOUR = 15;
/** The viewer's own clock (the browser's local time zone), taken at the moment of the call. */
export const fridayAfternoon = (at: number) => {
  const when = new Date(at);
  return when.getDay() === 5 && when.getHours() >= FRIDAY_FROM_HOUR;
};
export const fridayDeploy = (s: LifeSignal) => deployStarted(s) && fridayAfternoon(s.at);
