export const ALLOWED = [
  'MIT',
  'MIT-0',
  'ISC',
  '0BSD',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  'BlueOak-1.0.0',
  'Zlib',
  'Unlicense',
  'CC0-1.0',
  'Python-2.0',
  'CC-BY-4.0',
];
/** Accepted with a condition, recorded here. A shipped package under one of these fails the check unless it is listed in
 * `APPROVED`. */
export const CONDITIONAL = {
  'MPL-2.0':
    'file-level copyleft: use unmodified files only; ship the licence and say where the source is',
  'CC-BY-3.0': 'attribution required',
};
/** Never accepted (strong or network copyleft, source-available, non-commercial or "ethical" riders). */
export const DENIED =
  /^(A?GPL|LGPL|SSPL|BUSL|Elastic|EUPL|OSL|RPL|CPAL|Commons-Clause|CC-BY-NC|CC-BY-SA|CC-BY-ND|PolyForm|JSON$|Hippocratic|Parity|Prosperity)/i;
export const ALLOWED_EXCEPTIONS = new Set(['LLVM-exception', 'Classpath-exception-2.0']);

/**
 * Packages whose licence is not (only) what their package.json says, with the recorded decision. `declared` must still
 * match the installed package.json, so a change upstream reopens the decision.
 */
export const EXCEPTIONS = {
  '@anthropic-ai/claude-agent-sdk': {
    declared: 'SEE LICENSE IN README.md',
    license: 'LicenseRef-Anthropic-Commercial-Terms',
    approved: true,
    note:
      'Proprietary. LICENSE.md: "© Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined ' +
      'here: https://code.claude.com/docs/en/legal-and-compliance." Installed from npm by the user; not copied into this ' +
      'repository or bundled into any build output.',
  },
  'webgl-constants': {
    declared: null,
    license: 'MIT',
    approved: true,
    note: 'No license field; the LICENSE file is the MIT text (Copyright (c) 2019 Tim van Scherpenzeel).',
  },
};

/** Platform builds (installed only on a matching OS/CPU): the licence is recorded per family so that the output does not
 * depend on the machine; an installed build is still checked against it. */
export const PLATFORM_FAMILIES = [
  [
    /^@anthropic-ai\/claude-agent-sdk-/,
    '@anthropic-ai/claude-agent-sdk',
    'LicenseRef-Anthropic-Commercial-Terms',
  ],
  [/^@esbuild\//, 'esbuild', 'MIT'],
  [/^@rolldown\/binding-/, 'rolldown', 'MIT'],
  [/^@typescript\/typescript-/, 'typescript', 'Apache-2.0'],
  [/^lightningcss-/, 'lightningcss', 'MPL-2.0'],
  [/^fsevents$/, 'fsevents', 'MIT'],
];
export const FAMILY_DECLARED = {
  'LicenseRef-Anthropic-Commercial-Terms': 'SEE LICENSE IN LICENSE.md',
};

export const APPROVED = {};

export const BUILD_ONLY = new Set(['vite', '@vitejs/plugin-react']);

export const ROOTS = { 'apps/web': 'web', 'apps/control': 'server', 'apps/runner': 'server' };
