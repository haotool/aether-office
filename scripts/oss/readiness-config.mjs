import { fileURLToPath } from 'node:url';

export const MB = 1024 * 1024;
export const KIT_GITLEAKS_CONFIG = fileURLToPath(
  new URL('../../.github/gitleaks.toml', import.meta.url),
);
export const SELF = /^(?:scripts\/oss\/|tests\/aether\/oss-)/;
export const DETAIL_LIMIT = 12;

export const REQUIRED_FILES = [
  'LICENSE',
  'README.md',
  '.github/CONTRIBUTING.md',
  '.github/CODE_OF_CONDUCT.md',
  '.github/SECURITY.md',
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/CODEOWNERS',
];
export const RECOMMENDED_FILES = [
  'CHANGELOG.md',
  '.gitignore',
  '.editorconfig',
  '.gitattributes',
  '.github/dependabot.yml',
  'docs/legal/THIRD_PARTY_NOTICES.md',
];
export const REQUIRED_IGNORES = [
  'node_modules',
  'dist',
  '.data',
  '.env',
  '*.blend1',
  'coverage',
  'test-results',
  '.oss-private-patterns',
];
export const FORBIDDEN_TRACKED = [
  [/(^|\/)node_modules\//, 'dependencies'],
  [/(^|\/)dist\//, 'build output'],
  [/^\.data\//, 'runtime data directory'],
  [/(^|\/)\.env(\.(?!example$).*)?$/, 'environment file'],
  [/^\.(claude|cursor|codex|omc|aider|superclaude)(\/|$)/, 'agent configuration or worktrees'],
  [/\.blend1?$/, "Blender file (embeds the builder's paths)"],
  [/(^|\/)\.DS_Store$/, 'macOS metadata'],
  [/^\.(tools|research)\//, 'local tooling'],
  [/\.(sqlite3?|db)(-wal|-shm)?$/, 'database file'],
  [/\.(pem|p12|pfx|key)$|(^|\/)id_(rsa|ed25519)$/, 'key material'],
  [/(^|\/)\.npmrc$/, 'npm configuration (may hold a token)'],
  [/\.log$/, 'log file'],
];
export const PERMISSIVE =
  /^(MIT|MIT-0|ISC|BSD-2-Clause|BSD-3-Clause|0BSD|Apache-2\.0|Unlicense|CC0-1\.0|BlueOak-1\.0\.0|Zlib|Python-2\.0|CC-BY-4\.0|WTFPL)$/i;
export const STRONG_COPYLEFT = /(^|[^L])GPL|AGPL|SSPL|EUPL|CC-BY-SA|OSL/i;
