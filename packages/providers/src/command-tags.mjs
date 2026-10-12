// A closed-vocabulary classifier: labels from COMMAND_TAGS and nothing else, arguments and paths are only compared,
// never returned, so a tag needs no redaction. Dependency-free because the hook receiver runs alone.
// ponytail: quotes are honoured but `bash -c "..."` payloads, aliases and shell functions are not looked into.

export const COMMAND_TAGS = [
  'test',
  'build',
  'typecheck',
  'lint',
  'install',
  'docker',
  'deploy',
  'publish',
  'release',
  'ci.watch',
  'git.commit',
  'git.push',
  'git.push.force',
  'git.merge',
  'git.rebase',
  'git.reset.hard',
  'git.conflict.marker',
  'gh.pr.approve',
  'fs.rm.recursive',
  'sudo',
  'curl.pipe',
  'editor.vim',
  'search.todo',
];

const MAX_COMMAND = 4000;
const MAX_PATTERN = 400;
const MAX_TAGS = 4;
const MAX_POSITIONAL = 3;

// A word is a run of plain characters and quoted strings; the shell's separators are words of their own.
const FD_DUP = /\d*[<>]&\d+/g;
const TOKEN = /(?:[^\s"';|&<>]|"(?:[^"\\]|\\.)*"|'[^']*')+|&&|\|\||[;|&\n]|[<>]+/g;
const SEPARATOR = /^(?:&&|\|\||[;|&\n])$/;
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const unquote = (word) => word.replace(/["']/g, '');
const positionals = (args) => args.filter((a) => !a.startsWith('-'));
const hasFlag = (args, ...names) => args.some((a) => names.includes(a));

function segmentsOf(text) {
  const segments = [];
  let words = [];
  for (const [token] of text.replaceAll(FD_DUP, ' ').matchAll(TOKEN)) {
    if (SEPARATOR.test(token)) {
      if (words.length) segments.push({ words, end: token });
      words = [];
    } else if (!/^[<>]+$/.test(token)) {
      const word = unquote(token).replace(/^\(+|\)+$/g, '');
      if (word) words.push(word);
    }
  }
  if (words.length) segments.push({ words, end: '' });
  return segments;
}

const WORD_TAG = new Map([
  ...['test', 'tests', 'vitest', 'jest', 'pytest', 'mocha', 'e2e'].map((w) => [w, 'test']),
  ...['build', 'compile', 'bundle', 'assemble', 'webpack', 'rollup', 'esbuild', 'tsup'].map((w) => [
    w,
    'build',
  ]),
  ...['typecheck', 'type-check', 'check-types', 'tsc', 'mypy', 'pyright'].map((w) => [
    w,
    'typecheck',
  ]),
  ...['lint', 'eslint', 'prettier', 'biome', 'ruff', 'stylelint'].map((w) => [w, 'lint']),
  ...['install', 'i', 'add', 'sync'].map((w) => [w, 'install']),
  ['deploy', 'deploy'],
  ['publish', 'publish'],
  ['release', 'release'],
]);
const LAUNCHERS = new Set(['npm', 'pnpm', 'yarn', 'bun', 'npx', 'bunx', 'pnpx']);
const TARGET_RUNNERS = new Set([
  'make',
  'just',
  'task',
  'gradle',
  'gradlew',
  'mvn',
  'turbo',
  'nx',
  'vite',
  'next',
]);
const ALONE_TAG = new Map([
  ...['vitest', 'jest', 'pytest', 'mocha', 'rspec', 'phpunit', 'ava'].map((p) => [p, 'test']),
  ...['webpack', 'rollup', 'esbuild', 'tsup', 'parcel'].map((p) => [p, 'build']),
  ...['mypy', 'pyright'].map((p) => [p, 'typecheck']),
  ...[
    'eslint',
    'prettier',
    'biome',
    'ruff',
    'flake8',
    'pylint',
    'stylelint',
    'shellcheck',
    'rubocop',
    'golangci-lint',
  ].map((p) => [p, 'lint']),
  ...['docker', 'docker-compose', 'podman', 'nerdctl'].map((p) => [p, 'docker']),
  ...['vim', 'vi', 'nvim', 'view'].map((p) => [p, 'editor.vim']),
]);
const SUBCOMMAND_TAG = {
  go: { test: 'test', build: 'build', vet: 'lint', get: 'install' },
  cargo: {
    test: 'test',
    nextest: 'test',
    build: 'build',
    check: 'typecheck',
    clippy: 'lint',
    install: 'install',
    fetch: 'install',
    add: 'install',
    publish: 'publish',
  },
  pip: { install: 'install' },
  pip3: { install: 'install' },
  poetry: { install: 'install', add: 'install', publish: 'publish' },
  uv: { sync: 'install', add: 'install' },
  apt: { install: 'install' },
  'apt-get': { install: 'install' },
  brew: { install: 'install' },
  gem: { install: 'install' },
  bundle: { install: 'install' },
  composer: { install: 'install', require: 'install' },
  vercel: { deploy: 'deploy' },
  netlify: { deploy: 'deploy' },
  wrangler: { deploy: 'deploy', publish: 'deploy' },
  fly: { deploy: 'deploy' },
  flyctl: { deploy: 'deploy' },
  firebase: { deploy: 'deploy' },
  serverless: { deploy: 'deploy' },
  sls: { deploy: 'deploy' },
  cdk: { deploy: 'deploy' },
  sam: { deploy: 'deploy' },
  pulumi: { up: 'deploy' },
  terraform: { apply: 'deploy' },
  kubectl: { apply: 'deploy', rollout: 'deploy' },
  helm: { upgrade: 'deploy', install: 'deploy' },
  twine: { upload: 'publish' },
  playwright: { install: 'install', test: 'test' },
  cypress: { run: 'test' },
};
const WRAPPERS = new Set(['time', 'nohup', 'nice', 'env', 'command', 'exec', 'builtin']);
const GROUPING = new Set(['then', 'do', 'else', 'elif', '!', '{']);
const ESCALATORS = new Set(['sudo', 'doas']);
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);
const FETCHERS = new Set(['curl', 'wget']);
const RUN_WORDS = new Set(['run', 'exec']);
const TOOL_LAUNCHERS = new Set(['npx', 'bunx', 'pnpx']);
const EXEC_WORDS = new Set(['exec', 'dlx', 'x']);
const RUNNERS = new Set(['uv', 'poetry', 'pipenv', 'bundle']);
const ESCALATOR_OPTIONS_WITH_VALUE = new Set(['-u', '-g', '-h', '-p', '-C', '-r', '-t']);
const GIT_OPTIONS_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace']);
const DANGEROUS_OPERAND = /^(?:\/[^/]*\/?\*?|~\/?\*?|\*|\.\*|\.\.?\/?\*?|\$\{?HOME\}?\/?\*?)$/;

const tscTag = (args) => (args.some((a) => a.toLowerCase() === '--noemit') ? 'typecheck' : 'build');

function scriptTag(args) {
  for (const word of positionals(args).slice(0, MAX_POSITIONAL)) {
    const name = word.split(/[:/]/)[0].toLowerCase();
    if (name === 'tsc') return tscTag(args);
    const tag = WORD_TAG.get(name);
    if (tag) return tag;
  }
  return undefined;
}

function gitTags(args) {
  let sub;
  let rest = [];
  for (let i = 0; i < args.length; i++) {
    if (GIT_OPTIONS_WITH_VALUE.has(args[i])) i++;
    else if (!args[i].startsWith('-')) {
      sub = args[i];
      rest = args.slice(i + 1);
      break;
    }
  }
  if (sub === 'commit') return ['git.commit'];
  if (sub === 'merge') return ['git.merge'];
  if (sub === 'rebase') return ['git.rebase'];
  if (sub === 'reset') return hasFlag(rest, '--hard') ? ['git.reset.hard'] : [];
  if (sub !== 'push') return [];
  const forced = rest.some(
    (a) =>
      /^--force(?:-with-lease|-if-includes)?(?:=.*)?$/.test(a) ||
      /^-[a-zA-Z]*f[a-zA-Z]*$/.test(a) ||
      /^\+\S/.test(a),
  );
  return forced ? ['git.push', 'git.push.force'] : ['git.push'];
}

function ghTags(args) {
  const [area, action] = positionals(args);
  if (area === 'pr' && action === 'review')
    return hasFlag(args, '--approve', '-a') ? ['gh.pr.approve'] : [];
  if ((area === 'pr' && action === 'checks') || (area === 'run' && action === 'watch'))
    return ['ci.watch'];
  return area === 'release' && action === 'create' ? ['release'] : [];
}

function rmTags(args) {
  const recursive = args.some((a) => /^-[a-zA-Z]*[rR][a-zA-Z]*$/.test(a) || a === '--recursive');
  const reaches = positionals(args).some((a) => DANGEROUS_OPERAND.test(a));
  return recursive && (reaches || hasFlag(args, '--no-preserve-root')) ? ['fs.rm.recursive'] : [];
}

function programTags(words, depth = 0) {
  const [program, ...args] = words;
  const name = program.split('/').pop().toLowerCase();
  const sub = positionals(args)[0];
  if (name === 'git') return gitTags(args);
  if (name === 'gh') return ghTags(args);
  if (name === 'rm') return rmTags(args);
  if (name === 'tsc') return [tscTag(args)];
  if (depth === 0 && RUN_WORDS.has(sub) && RUNNERS.has(name)) {
    const after = args.slice(args.indexOf(sub) + 1);
    return after.length ? programTags(after, 1) : [];
  }
  if (name === 'npm' && sub === 'ci') return ['install'];
  if (depth < 2 && (TOOL_LAUNCHERS.has(name) || (LAUNCHERS.has(name) && EXEC_WORDS.has(sub)))) {
    const rest = TOOL_LAUNCHERS.has(name) ? args : args.slice(args.indexOf(sub) + 1);
    const tool = rest.findIndex((a) => !a.startsWith('-'));
    return tool >= 0 ? programTags(rest.slice(tool), depth + 1) : [];
  }
  if (SUBCOMMAND_TAG[name]) return SUBCOMMAND_TAG[name][sub] ? [SUBCOMMAND_TAG[name][sub]] : [];
  if (LAUNCHERS.has(name) || TARGET_RUNNERS.has(name)) {
    const tag = scriptTag(args);
    return tag ? [tag] : [];
  }
  if (/^python3?(?:\.\d+)?$/.test(name) && args[0] === '-m')
    return ['pytest', 'unittest'].includes(args[1]) ? ['test'] : [];
  return ALONE_TAG.has(name) ? [ALONE_TAG.get(name)] : [];
}

function bareCommand(words) {
  let i = 0;
  let escalated = false;
  while (i < words.length) {
    const word = words[i];
    if (ASSIGNMENT.test(word) || GROUPING.has(word)) i++;
    else if (WRAPPERS.has(word)) {
      i++;
      while (i < words.length && (words[i].startsWith('-') || /^\d+$/.test(words[i]))) i++;
    } else if (ESCALATORS.has(word)) {
      escalated = true;
      i++;
      while (i < words.length && words[i].startsWith('-'))
        i += ESCALATOR_OPTIONS_WITH_VALUE.has(words[i]) ? 2 : 1;
    } else break;
  }
  return { words: words.slice(i), escalated };
}

const TODO_WORD = /\b(?:TODO|FIXME)\b/;
const CONFLICT_MARKER = /<{7}|>{7}/;
const SEARCH_PROGRAMS = new Set(['grep', 'rg', 'ag', 'ack', 'egrep', 'fgrep']);

function searchTags(text) {
  const tags = [];
  if (CONFLICT_MARKER.test(text)) tags.push('git.conflict.marker');
  if (TODO_WORD.test(text)) tags.push('search.todo');
  return tags;
}

export function commandTags(command, tool, pattern) {
  const tags = new Set();
  if (tool === 'Grep' && typeof pattern === 'string')
    for (const t of searchTags(pattern.slice(0, MAX_PATTERN))) tags.add(t);
  if (typeof command === 'string') {
    const text = command
      .slice(0, MAX_COMMAND)
      .replace(/(<<-?[ \t]*(['"]?)(\w+)\2[^\n]*)\n[\s\S]*?\n[ \t]*\3(?=\n|$)/g, '$1');
    const segments = segmentsOf(text);
    segments.forEach((segment, i) => {
      const { words, escalated } = bareCommand(segment.words);
      if (escalated) tags.add('sudo');
      if (!words.length) return;
      if (SEARCH_PROGRAMS.has(words[0].split('/').pop()))
        for (const t of searchTags(words.slice(1).join(' '))) tags.add(t);
      for (const t of programTags(words)) tags.add(t);
      const next = segments[i + 1] ? bareCommand(segments[i + 1].words).words[0] : undefined;
      if (
        FETCHERS.has(words[0].split('/').pop()) &&
        segment.end === '|' &&
        next &&
        SHELLS.has(next.split('/').pop())
      )
        tags.add('curl.pipe');
    });
  }
  return [...tags].slice(0, MAX_TAGS);
}
