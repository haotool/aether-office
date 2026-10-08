import {
  buildFailed,
  ciWatched,
  conflictsAppeared,
  curlPiped,
  deployStarted,
  forcePushStarted,
  fridayDeploy,
  hardReset,
  prApproved,
  rmRecursive,
  sudoStarted,
  todoSearch,
  testsFailed,
  testsPassed,
} from './matchers.js';
import type { LifeRule } from './registry.js';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/**
 * Wave 2: the rows whose data is real since the server labels commands (`tags`) and reports how they ended (`ok`). A rule
 * that says how something ended has `claimsOutcome` and its matcher reads `ok === true` or `ok === false`, so an outcome the
 * provider did not state (null) never starts one. The rest start from what a command was started as. Order matters where two
 * rules read the same call: the first one the arbiter lets in wins (the Friday sign over the plain launch pad).
 */
export const COMMAND_OUTCOME_RULES: readonly LifeRule[] = [
  {
    id: 'ci-pass',
    row: 'R10',
    category: 'test',
    decorative: true,
    claimsOutcome: true,
    when: testsPassed,
    durationMs: 3_200,
    cooldownMs: 10 * MINUTE,
    scope: 'member',
    chance: 0.5,
    minTier: 'balanced',
    reduced: 'static',
    anchor: 'desk',
    pose: { clip: 'nod', atMs: 600 },
    aria: (who, zh) =>
      zh ? `${who} 的測試指令順利結束` : `${who}'s test command exited successfully`,
  },
  {
    id: 'ci-fail',
    row: 'R11',
    category: 'test',
    decorative: true,
    claimsOutcome: true,
    when: testsFailed,
    durationMs: 3_600,
    cooldownMs: 8 * MINUTE,
    scope: 'member',
    chance: 0.7,
    minTier: 'balanced',
    reduced: 'static',
    anchor: 'desk',
    pose: { clip: 'shrug', atMs: 700 },
    aria: (who, zh) => (zh ? `${who} 的測試指令失敗了` : `${who}'s test command failed`),
  },
  {
    id: 'ci-stack',
    row: 'R12',
    category: 'test',
    decorative: true,
    claimsOutcome: true,
    when: ciWatched,
    durationMs: 3_600,
    cooldownMs: 10 * MINUTE,
    scope: 'member',
    chance: 0.8,
    minTier: 'balanced',
    reduced: 'static',
    anchor: 'desk',
    // The command's own exit status: `gh run watch` exits 0 without `--exit-status`, so this never says "CI passed".
    aria: (who, zh, s) =>
      s.ok
        ? zh
          ? `${who} 的 CI 監看指令順利結束`
          : `${who}'s CI watch command exited successfully`
        : zh
          ? `${who} 的 CI 監看指令以錯誤結束`
          : `${who}'s CI watch command exited with an error`,
  },
  {
    id: 'build-error',
    row: 'R13',
    category: 'test',
    decorative: true,
    claimsOutcome: true,
    when: buildFailed,
    durationMs: 3_000,
    cooldownMs: 10 * MINUTE,
    scope: 'member',
    chance: 0.7,
    minTier: 'balanced',
    reduced: 'static',
    anchor: 'desk',
    pose: { clip: 'shrug', atMs: 700 },
    aria: (who, zh) => (zh ? `${who} 的建置指令失敗了` : `${who}'s build command failed`),
  },
  {
    id: 'force-push',
    row: 'R18',
    category: 'git',
    decorative: true,
    claimsOutcome: false, // "started": whether it went through is not known
    when: forcePushStarted,
    durationMs: 4_000,
    cooldownMs: 30 * MINUTE,
    scope: 'member',
    chance: 0.9,
    minTier: 'balanced',
    reduced: 'static',
    anchor: 'desk',
    aria: (who, zh) => (zh ? `${who} 開始了強制 push` : `${who} started a force push`),
  },
  {
    id: 'merge-conflict',
    row: 'R19',
    category: 'git',
    decorative: true,
    claimsOutcome: false, // the count of conflicted files is git's own; a conflict-marker search only says what was searched
    when: conflictsAppeared,
    durationMs: 9_000,
    cooldownMs: 10 * MINUTE,
    scope: 'member',
    chance: 0.8,
    minTier: 'balanced',
    reduced: 'static',
    anchor: 'desk',
    aria: (who, zh, s) =>
      s.kind === 'tool.start'
        ? zh
          ? `${who} 正在搜尋合併衝突標記`
          : `${who} is searching for merge conflict markers`
        : zh
          ? `${who} 的儲存庫有 ${s.value ?? 1} 個衝突檔案`
          : `${who}'s repository has ${s.value ?? 1} conflicted files`,
  },
  {
    id: 'friday-deploy',
    row: 'R23',
    category: 'meme',
    decorative: true,
    claimsOutcome: false,
    when: fridayDeploy,
    durationMs: 3_800,
    cooldownMs: DAY,
    scope: 'member',
    chance: 1,
    minTier: 'balanced',
    reduced: 'static',
    anchor: 'desk',
    pose: { clip: 'shrug', atMs: 1200 },
    aria: (who, zh) =>
      zh ? `${who} 在週五下午開始部署` : `${who} started a deploy on a Friday afternoon`,
  },
  {
    id: 'launch-pad',
    row: 'R22',
    category: 'ops',
    decorative: true,
    claimsOutcome: false,
    when: deployStarted,
    durationMs: 5_200,
    cooldownMs: 15 * MINUTE,
    scope: 'member',
    chance: 0.8,
    minTier: 'balanced',
    reduced: 'static',
    anchor: 'desk',
    aria: (who, zh) => (zh ? `${who} 開始了部署` : `${who} started a deploy`),
  },
  {
    id: 'skull-gag',
    row: 'R25',
    category: 'meme',
    decorative: true,
    claimsOutcome: false, // only a picture: nothing is executed or blocked by it
    when: rmRecursive,
    durationMs: 2_600,
    cooldownMs: 30 * MINUTE,
    scope: 'member',
    chance: 0.8,
    minTier: 'balanced',
    reduced: 'static',
    anchor: 'desk',
    aria: (who, zh) =>
      zh ? `${who} 開始了遞迴刪除指令` : `${who} started a recursive delete command`,
  },
  {
    id: 'sudo-prompt',
    row: 'R59',
    category: 'meme',
    decorative: true,
    claimsOutcome: false,
    when: sudoStarted,
    durationMs: 2_800,
    cooldownMs: 20 * MINUTE,
    scope: 'member',
    chance: 0.6,
    minTier: 'balanced',
    reduced: 'static',
    anchor: 'desk',
    aria: (who, zh) => (zh ? `${who} 開始了 sudo 指令` : `${who} started a command with sudo`),
  },
  {
    id: 'curl-pipe',
    row: 'R60',
    category: 'meme',
    decorative: true,
    claimsOutcome: false,
    when: curlPiped,
    durationMs: 3_000,
    cooldownMs: 30 * MINUTE,
    scope: 'member',
    chance: 0.7,
    minTier: 'balanced',
    reduced: 'static',
    anchor: 'desk',
    aria: (who, zh) =>
      zh
        ? `${who} 開始了把下載內容直接交給 shell 的指令`
        : `${who} started a command that pipes a download into a shell`,
  },
  {
    id: 'works-machine',
    row: 'R46',
    category: 'meme',
    decorative: true,
    claimsOutcome: true, // both runs are real outcomes: the web derives the signal from them, with the failed run's `ok`
    when: (s) => s.kind === 'tests.machine',
    durationMs: 3_600,
    cooldownMs: DAY,
    scope: 'member',
    chance: 1,
    minTier: 'balanced',
    reduced: 'static',
    anchor: 'desk',
    aria: (_who, zh) =>
      zh ? '測試在一個工作階段通過、在另一個失敗' : 'Tests pass in one session and fail in another',
  },
  {
    id: 'not-a-bug',
    row: 'R47',
    category: 'meme',
    decorative: true,
    claimsOutcome: true, // failed, then a test file was edited, then passed: all three read from real calls
    when: (s) => s.kind === 'tests.edited',
    durationMs: 3_800,
    cooldownMs: DAY,
    scope: 'member',
    chance: 1,
    minTier: 'balanced',
    reduced: 'static',
    anchor: 'desk',
    aria: (_who, zh) => (zh ? '測試被修改過，然後通過了' : 'The tests were changed, then passed'),
  },
  {
    id: 'lgtm',
    row: 'R48',
    category: 'social',
    decorative: true,
    claimsOutcome: true, // a real `gh pr review --approve` that exited successfully
    when: prApproved,
    durationMs: 2_400,
    cooldownMs: 10 * MINUTE,
    scope: 'member',
    chance: 0.9,
    minTier: 'balanced',
    reduced: 'static',
    anchor: 'desk',
    aria: (who, zh) => (zh ? `${who} 核准了一個 pull request` : `${who} approved a pull request`),
  },
  {
    id: 'time-machine',
    row: 'R21',
    category: 'git',
    decorative: true,
    claimsOutcome: false, // "started": a hard reset's result is not known, and the swirl carries no danger tone
    when: hardReset,
    durationMs: 2_000,
    cooldownMs: 30 * MINUTE,
    scope: 'member',
    chance: 0.8,
    minTier: 'high',
    reduced: 'none',
    anchor: 'desk',
    aria: (who, zh) =>
      zh ? `${who} 開始執行 git reset --hard` : `${who} started a hard reset of the working tree`,
  },
  {
    id: 'todo-notes',
    row: 'R43',
    category: 'work',
    decorative: true,
    claimsOutcome: false, // the pattern is never stored: only the tag says this was a search for TODOs
    when: todoSearch,
    durationMs: 3_000,
    cooldownMs: 30 * MINUTE,
    scope: 'member',
    chance: 0.8,
    minTier: 'balanced',
    reduced: 'none',
    anchor: 'desk',
    aria: (who, zh) => (zh ? `${who} 正在搜尋待辦註記` : `${who} is looking for TODOs`),
  },
];
