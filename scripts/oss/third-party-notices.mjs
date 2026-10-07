#!/usr/bin/env node
// Third-party notices, software bill of materials and licence gate, generated from pnpm-lock.yaml and the installed
// packages (node_modules/.pnpm). No network, no dependencies.
//
//   node scripts/oss/third-party-notices.mjs           write THIRD_PARTY_NOTICES.md, docs/legal/sbom.cdx.json and the
//                                                       generated table of docs/legal/inventory.md
//   node scripts/oss/third-party-notices.mjs --check   fail when a committed file is out of date, or a package has an
//                                                       unknown, denied or unapproved licence (CI)
//
// "Shipped" packages are the production dependency closure of apps/control, apps/runner and apps/web (and the workspace
// packages they link): the web build inlines the browser part, the server runs the rest from node_modules. Everything else
// in the lockfile is a development or build tool. The policy below is the one documented in docs/legal/licence-policy.md.
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

// ---------------------------------------------------------------------------------------------------------------- policy

/** Licences accepted without review, in order of preference when a package offers a choice (`A OR B`). */
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
/** Exceptions accepted after `WITH`. */
const ALLOWED_EXCEPTIONS = new Set(['LLVM-exception', 'Classpath-exception-2.0']);

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
/** The licence a platform family declares in its package.json (to compare with an installed build). */
const FAMILY_DECLARED = { 'LicenseRef-Anthropic-Commercial-Terms': 'SEE LICENSE IN LICENSE.md' };

/** Shipped packages accepted under a CONDITIONAL licence, or with proprietary terms, and why. */
export const APPROVED = {};

/** Listed as dependencies of apps/web but used only to build it; nothing of them reaches the bundle. */
export const BUILD_ONLY = new Set(['vite', '@vitejs/plugin-react']);

const ROOTS = { 'apps/web': 'web', 'apps/control': 'server', 'apps/runner': 'server' };

// ------------------------------------------------------------------------------------------------------------- lockfile

const unquote = (s) =>
  s
    .trim()
    .replace(/^'(.*)'$/, '$1')
    .replace(/^"(.*)"$/, '$1');

/** Parses the parts of a pnpm v9 lockfile this script needs (the last YAML document when there are several). */
export function parseLockfile(text) {
  const docs = text.split(/^---\s*$/m).filter((d) => /^importers:/m.test(d));
  const doc = docs.at(-1) ?? '';
  const importers = {};
  const packages = {};
  const snapshots = {};
  let section = null;
  let entry = null;
  let group = null;
  let dep = null;
  for (const line of doc.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;
    if (indent === 0) {
      section = line.replace(/:.*$/, '');
      entry = null;
      continue;
    }
    if (indent === 2 && /:\s*(\{\})?\s*$/.test(line)) {
      const key = unquote(line.replace(/:\s*(\{\})?\s*$/, ''));
      if (section === 'importers') entry = importers[key] = {};
      else if (section === 'packages') entry = packages[key] = {};
      else if (section === 'snapshots') entry = snapshots[key] = {};
      else entry = null;
      group = null;
      continue;
    }
    if (!entry) continue;
    const m = /^(\s+)('[^']*'|[^:]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = unquote(m[2]);
    const value = m[3].trim();
    if (indent === 4) {
      group = null;
      if (section === 'packages' && key === 'resolution') {
        const integrity = /integrity:\s*([^,}\s]+)/.exec(value);
        if (integrity) entry.integrity = integrity[1];
      } else if (section === 'packages' && (key === 'os' || key === 'cpu' || key === 'libc')) {
        entry.platform = true;
      } else if (/^(dependencies|devDependencies|optionalDependencies)$/.test(key) && !value) {
        group = entry[key] = {};
      }
    } else if (group && indent === 6) {
      if (section === 'importers') {
        dep = key;
        group[dep] = null;
      } else {
        group[key] = unquote(value);
      }
    } else if (group && indent === 8 && section === 'importers' && key === 'version') {
      group[dep] = unquote(value);
    }
  }
  return { importers, packages, snapshots };
}

/** `@scope/name@1.2.3(peer@1)` -> { name: '@scope/name', version: '1.2.3', id: '@scope/name@1.2.3' }. */
export function splitKey(key) {
  const base = key.replace(/\(.*$/, '');
  const at = base.lastIndexOf('@');
  return { name: base.slice(0, at), version: base.slice(at + 1), id: base };
}

/**
 * The production closure: package id -> Set of scopes ('web', 'server'), following dependencies and optional
 * dependencies from the app importers and the workspace packages they link.
 */
export function shippedClosure(lock, roots = ROOTS, buildOnly = BUILD_ONLY) {
  const scopes = new Map();
  const visit = (key, scope) => {
    const { id, name } = splitKey(key);
    if (name.startsWith('@types/')) return; // type declarations are erased by compilation

    const seen = scopes.get(id) ?? new Set();
    if (seen.has(scope) && scopes.has(id)) return;
    seen.add(scope);
    scopes.set(id, seen);
    const snap = lock.snapshots[key] ?? lock.snapshots[id] ?? {};
    for (const deps of [snap.dependencies, snap.optionalDependencies])
      for (const [name, version] of Object.entries(deps ?? {}))
        if (!version.startsWith('link:')) visit(`${name}@${version}`, scope);
  };
  const visitImporter = (importerPath, scope, done) => {
    if (done.has(importerPath)) return;
    done.add(importerPath);
    const importer = lock.importers[importerPath] ?? {};
    for (const deps of [importer.dependencies, importer.optionalDependencies])
      for (const [name, version] of Object.entries(deps ?? {})) {
        if (!version) continue;
        if (version.startsWith('link:')) {
          visitImporter(
            path.posix.normalize(path.posix.join(importerPath, version.slice(5))),
            scope,
            done,
          );
        } else if (!(importerPath === 'apps/web' && buildOnly.has(name))) {
          visit(`${name}@${version}`, scope);
        }
      }
  };
  for (const [importerPath, scope] of Object.entries(roots))
    visitImporter(importerPath, scope, new Set());
  return scopes;
}

// ------------------------------------------------------------------------------------------------------------- licences

/** Parses an SPDX licence expression into a tree; throws on a malformed one. */
export function parseSpdx(expression) {
  const tokens = expression.match(/\(|\)|[^\s()]+/g) ?? [];
  let i = 0;
  const peek = () => tokens[i];
  const primary = () => {
    const token = tokens[i++];
    if (token === '(') {
      const inner = or();
      if (tokens[i++] !== ')') throw new Error(`unbalanced parentheses in "${expression}"`);
      return inner;
    }
    if (!token || /^(AND|OR|WITH|\))$/i.test(token))
      throw new Error(`malformed licence expression "${expression}"`);
    if (peek()?.toUpperCase() === 'WITH') {
      i += 1;
      return { id: token.replace(/\+$/, ''), exception: tokens[i++] };
    }
    return { id: token.replace(/\+$/, '') };
  };
  const and = () => {
    let left = primary();
    while (peek()?.toUpperCase() === 'AND') {
      i += 1;
      left = { and: [left, primary()] };
    }
    return left;
  };
  const or = () => {
    let left = and();
    while (peek()?.toUpperCase() === 'OR') {
      i += 1;
      left = { or: [left, and()] };
    }
    return left;
  };
  const tree = or();
  if (i !== tokens.length) throw new Error(`unexpected "${tokens[i]}" in "${expression}"`);
  return tree;
}

const rank = (id) => {
  const index = ALLOWED.indexOf(id);
  return index === -1 ? (CONDITIONAL[id] ? 100 : 1000) : index;
};

/**
 * Picks the licence that applies: for `A OR B` the most permissive acceptable option, for `A AND B` both. Returns
 * { chosen, status } where status is 'allowed', 'conditional', 'denied' or 'unknown'.
 */
export function evaluate(expression) {
  if (!expression || /^(UNKNOWN|UNLICENSED|SEE LICENSE)/i.test(expression))
    return { chosen: expression, status: 'unknown' };
  if (expression.startsWith('LicenseRef-')) return { chosen: expression, status: 'conditional' };
  let tree;
  try {
    tree = parseSpdx(expression);
  } catch {
    return { chosen: expression, status: 'unknown' };
  }
  const order = { allowed: 0, conditional: 1, unknown: 2, denied: 3 };
  const walk = (node) => {
    if (node.or) {
      const options = node.or
        .map(walk)
        .sort((a, b) => order[a.status] - order[b.status] || a.rank - b.rank);
      return options[0];
    }
    if (node.and) {
      const parts = node.and.map(walk);
      const worst = parts.reduce((a, b) => (order[b.status] > order[a.status] ? b : a));
      return {
        text: parts.map((p) => p.text).join(' AND '),
        status: worst.status,
        rank: Math.max(...parts.map((p) => p.rank)),
      };
    }
    const text = node.exception ? `${node.id} WITH ${node.exception}` : node.id;
    let status = ALLOWED.includes(node.id)
      ? 'allowed'
      : CONDITIONAL[node.id]
        ? 'conditional'
        : 'unknown';
    if (DENIED.test(node.id)) status = 'denied';
    if (node.exception && !ALLOWED_EXCEPTIONS.has(node.exception) && status !== 'denied')
      status = 'unknown';
    return { text, status, rank: rank(node.id) };
  };
  const result = walk(tree);
  return { chosen: result.text, status: result.status };
}

/** The `license` field as an expression; old `licenses` arrays become `A OR B`. */
export function declaredLicense(manifest) {
  const raw = manifest.license ?? manifest.licenses;
  if (raw === undefined || raw === null) return null;
  if (Array.isArray(raw)) return raw.map((l) => (typeof l === 'string' ? l : l.type)).join(' OR ');
  if (typeof raw === 'object') return raw.type ?? null;
  return String(raw);
}

/** Recognises the common licence texts in a file (a file can hold several, e.g. ISC plus MIT for ported parts). */
export function sniffLicenses(text) {
  const t = text.slice(0, 20000).replace(/\s+/g, ' ');
  const found = [];
  if (/Blue Oak Model License/i.test(t)) found.push('BlueOak-1.0.0');
  if (/Apache License,? Version 2\.0/i.test(t)) found.push('Apache-2.0');
  if (/Mozilla Public License,? (Version|v\.?) ?2\.0/i.test(t)) found.push('MPL-2.0');
  if (/free and unencumbered software released into the public domain/i.test(t))
    found.push('Unlicense');
  if (/Permission is hereby granted, free of charge/i.test(t)) found.push('MIT');
  if (/Permission to use, copy, modify, and\/?or distribute this software for any purpose/i.test(t))
    found.push(/provided that the above copyright notice/i.test(t) ? 'ISC' : '0BSD');
  if (/Redistribution and use in source and binary forms/i.test(t))
    found.push(
      /Neither the name|names of (its|the|any) contributors/i.test(t)
        ? 'BSD-3-Clause'
        : 'BSD-2-Clause',
    );
  if (/CC0 1\.0 Universal/i.test(t)) found.push('CC0-1.0');
  return found;
}

/** Copyright lines of a licence text (template placeholders and "the above copyright notice" sentences excluded). */
export function copyrightLines(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw
      .trim()
      .replace(/^[#*>\-\s]+/, '')
      .replace(/\s+/g, ' ');
    // "Copyright 2020 Name", "Copyright (c) Name", "© Name", "(c) 2020 Name"; not "copyright license to ..." or the
    // "(c) You must retain ..." clause of the Apache License.
    const named = /^copyright\s*(\(c\)|©)?\s*:?\s*(.*)$/i.exec(line);
    const ok = named
      ? /^(\d{4}|[A-Z(<"]|\w+@)/.test(named[2])
      : /^©\s*\S/.test(line) ||
        /^\(c\)\s*\d{4}/i.test(line) ||
        /\bCopyright\s+(\(c\)\s*)?(\d{4}|[A-Z][a-z])/.test(line);
    if (!ok) continue;
    if (
      /notice|\[yyyy\]|\{yyyy\}|<year>|\[name of copyright owner\]|copyright holders? (and|be)/i.test(
        line,
      )
    )
      continue;
    if (!out.includes(line)) out.push(line.slice(0, 200));
  }
  return out;
}

export const normalizeText = (text) =>
  text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .trim();
export const textHash = (text) => createHash('sha256').update(normalizeText(text)).digest('hex');

// -------------------------------------------------------------------------------------------------------- the packages

const LICENSE_FILE = /^(licen[cs]e|copying)([-._].*)?$/i;
const NOTICE_FILE = /^notice([-._].*)?$/i;

/** name@version -> package directory, for every real (non-symlinked) package under node_modules/.pnpm. */
export function installedPackages(store) {
  const map = new Map();
  if (!existsSync(store)) return map;
  for (const entry of readdirSync(store)) {
    const modules = path.join(store, entry, 'node_modules');
    if (!existsSync(modules)) continue;
    for (const top of readdirSync(modules)) {
      const dirs = top.startsWith('@')
        ? readdirSync(path.join(modules, top)).map((n) => path.join(modules, top, n))
        : [path.join(modules, top)];
      for (const dir of dirs) {
        if (lstatSync(dir).isSymbolicLink() || !existsSync(path.join(dir, 'package.json')))
          continue;
        const manifest = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
        map.set(`${manifest.name}@${manifest.version}`, dir);
      }
    }
  }
  return map;
}

const authorOf = (manifest) =>
  typeof manifest.author === 'string' ? manifest.author : (manifest.author?.name ?? null);

/** Everything known about one locked package; `dir` is null when it is not installed on this machine. */
export function describePackage({ name, version, dir, platform, integrity }) {
  const family = platform ? PLATFORM_FAMILIES.find(([re]) => re.test(name)) : null;
  const pkg = {
    name,
    version,
    integrity,
    platform: Boolean(platform),
    problems: [],
    licenseTexts: [],
    notices: [],
  };
  let manifest = null;
  if (dir) {
    manifest = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
    for (const file of readdirSync(dir).sort()) {
      if (!lstatSync(path.join(dir, file)).isFile()) continue;
      if (LICENSE_FILE.test(file))
        pkg.licenseTexts.push({ file, text: readFileSync(path.join(dir, file), 'utf8') });
      else if (NOTICE_FILE.test(file))
        pkg.notices.push({ file, text: readFileSync(path.join(dir, file), 'utf8') });
    }
  }
  const declared = manifest ? declaredLicense(manifest) : null;
  pkg.declared = declared;
  pkg.author = manifest ? authorOf(manifest) : null;
  pkg.homepage = manifest?.homepage ?? null;
  const exception = EXCEPTIONS[name];
  if (family) {
    pkg.license = family[2];
    pkg.source = `recorded for the ${family[1]} platform builds`;
    const expected = FAMILY_DECLARED[family[2]] ?? family[2];
    if (manifest && declared !== expected)
      pkg.problems.push(`declares "${declared}", recorded "${expected}" for its platform family`);
    // Platform builds are compared, not reproduced: their text is the same as the family's and may be absent here.
    pkg.licenseTexts = [];
    pkg.notices = [];
  } else if (exception) {
    pkg.license = exception.license;
    pkg.source = `recorded decision: ${exception.note}`;
    if (manifest && declared !== exception.declared)
      pkg.problems.push(
        `declares "${declared}" but the recorded decision is for "${exception.declared}"`,
      );
  } else if (!manifest) {
    pkg.license = 'UNKNOWN';
    pkg.source = 'not installed';
    pkg.problems.push('not installed: run pnpm install --frozen-lockfile');
  } else {
    pkg.license = declared ?? 'UNKNOWN';
    pkg.source = 'package.json license field';
  }
  const { chosen, status } = evaluate(pkg.license);
  pkg.chosen = chosen;
  pkg.status = status;
  const main = pkg.licenseTexts[0];
  const found = main ? sniffLicenses(main.text) : [];
  pkg.fileLicense = found.length ? found.join(' + ') : null;
  if (!family && found.length && !exception) {
    const ids = pkg.license.match(/[A-Za-z0-9.+-]+/g) ?? [];
    if (!found.some((id) => ids.includes(id)))
      pkg.problems.push(
        `${main.file} reads as ${pkg.fileLicense} but package.json says ${pkg.license}`,
      );
  }
  pkg.copyright = [...new Set(pkg.licenseTexts.flatMap((t) => copyrightLines(t.text)))];
  return pkg;
}

/** Reads the lockfile and node_modules and classifies every package. */
export function collect(root) {
  const lock = parseLockfile(readFileSync(path.join(root, 'pnpm-lock.yaml'), 'utf8'));
  const installed = installedPackages(path.join(root, 'node_modules', '.pnpm'));
  const shipped = shippedClosure(lock);
  const ids = new Set(Object.keys(lock.snapshots).map((k) => splitKey(k).id));
  for (const key of Object.keys(lock.packages)) ids.add(splitKey(key).id);
  const all = [...ids].sort().map((id) => {
    const { name, version } = splitKey(id);
    const meta = lock.packages[id] ?? {};
    const pkg = describePackage({ name, version, dir: installed.get(id) ?? null, ...meta });
    const scopes = shipped.get(id);
    pkg.scope = scopes ? [...scopes].sort().join('+') : 'dev';
    return pkg;
  });
  return all;
}

/** Problems that fail the check. */
export function policyProblems(packages) {
  const out = [];
  for (const p of packages) {
    // A build for another platform is not installed here; its licence is the recorded family one.
    const problems = p.problems.filter((x) => !(p.platform && x.startsWith('not installed')));
    for (const problem of problems) out.push(`${p.name}@${p.version}: ${problem}`);
    if (p.status === 'denied')
      out.push(`${p.name}@${p.version}: ${p.chosen} is denied by the licence policy`);
    else if (p.status === 'unknown')
      out.push(`${p.name}@${p.version}: licence "${p.license}" is unknown or not approved`);
    else if (
      p.status === 'conditional' &&
      p.scope !== 'dev' &&
      !APPROVED[p.name] &&
      !EXCEPTIONS[p.name]?.approved &&
      !p.platform
    )
      out.push(
        `${p.name}@${p.version}: ${p.chosen} is shipped (${p.scope}) and needs an entry in APPROVED`,
      );
  }
  return out;
}

// --------------------------------------------------------------------------------------------------------------- output

const fence = (text) => {
  const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((s) => s.length));
  const ticks = '`'.repeat(longest + 1);
  return `${ticks}text\n${normalizeText(text)}\n${ticks}`;
};
const cell = (s) =>
  String(s ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ');
const SCOPE_LABEL = {
  web: 'web bundle',
  server: 'server runtime',
  'server+web': 'web bundle, server runtime',
  dev: 'dev/build',
};

const PREAMBLE = `# Third-party notices

<!-- Generated by scripts/oss/third-party-notices.mjs from pnpm-lock.yaml and the installed packages. Do not edit by hand:
     change the script or the dependencies and run \`pnpm run notices\`. \`pnpm run notices:check\` fails when this file is stale. -->

AETHER OFFICE is released under the [MIT License](LICENSE). This file reproduces the notices of the third-party material it
contains or ships with. The audit behind it, the licence policy and the provenance of every asset are in
[docs/legal](docs/legal/README.md).

## Code adapted from other projects

**agent-office** ([AgentSystemLabs/agent-office](https://github.com/AgentSystemLabs/agent-office), baseline commit
\`665aeec571bc03f76cbd16de8d628dd169a48874\`), MIT License, Copyright (c) 2026 AgentSystemLabs. The copyright notice and
the licence text are kept in [LICENSE](LICENSE). This project started from it; the upstream application is no longer in the
tree (it remains in the repository history). Still derived from it:

- \`tools/blender/aokit.py\`: the Blender modelling kit (shapes, smooth skin, rigs and clips, export).
- \`tools/blender/build_animals.py\`: its skinning steps follow the upstream \`blender/scripts/build_dog.py\`.
- \`packages/office-scene/src/geometry.ts\`: geometry helpers adapted from the upstream \`src/client/world/toon.ts\`.
- The animal models in \`apps/web/public/assets/animals\` are output of scripts built on that kit.

**Orca** ([stablyai/orca](https://github.com/stablyai/orca), commit \`373d951b\`), MIT License.
\`apps/control/src/services/redaction.ts\` adapts the secret patterns of \`src/shared/crash-report-redaction.ts\`:

${fence(`MIT License

Copyright (c) 2026 Lovecast Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`)}

## Generated protocol bindings

\`packages/providers/generated/codex-0.159.2*\` is the output of \`codex app-server generate-ts\` and
\`generate-json-schema\` of the OpenAI Codex CLI 0.159.2 ([openai/codex](https://github.com/openai/codex)), committed
unmodified. It is derived from Codex's protocol types and their documentation comments and is used under the Apache License
2.0 ([LICENSES/Apache-2.0.txt](LICENSES/Apache-2.0.txt)). Only TypeScript types are imported from it, so none of it is
present in the built application. The NOTICE of openai/codex reads:

${fence(`OpenAI Codex
Copyright 2025 OpenAI

This project includes code derived from [Ratatui](https://github.com/ratatui/ratatui), licensed under the MIT license.
Copyright (c) 2016-2022 Florian Dehau
Copyright (c) 2023-2025 The Ratatui Developers`)}

## Proprietary software this project works with

\`@anthropic-ai/claude-agent-sdk\` (and its per-platform builds, which contain the Claude Code executable) is not open source:
"© Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here:
https://code.claude.com/docs/en/legal-and-compliance." It is installed from npm when you install this project, is not
included in this repository or in the web build, and its use is governed by Anthropic's terms, which you accept by using it.
The Codex CLI and Claude Code themselves are installed separately by the user and are not distributed with this project.

## Trademarks

Claude and Claude Code are trademarks of Anthropic, PBC; OpenAI and Codex are trademarks of OpenAI. They are used only to
identify the tools this project works with; no affiliation, sponsorship or endorsement is implied. See
[docs/legal/trademarks.md](docs/legal/trademarks.md).
`;

/** THIRD_PARTY_NOTICES.md: the shipped packages, their licences grouped by identical text, and their NOTICE files. */
export function renderNotices(packages) {
  const shipped = packages.filter((p) => p.scope !== 'dev');
  const dev = packages.filter((p) => p.scope === 'dev');
  const groups = new Map();
  for (const p of shipped) {
    for (const t of p.licenseTexts) {
      const hash = textHash(t.text);
      const group = groups.get(hash) ?? { text: t.text, packages: [], licenses: new Set() };
      group.packages.push(`${p.name}@${p.version}`);
      group.licenses.add(p.chosen);
      groups.set(hash, group);
    }
  }
  const out = [PREAMBLE];
  out.push(`## Packages shipped with the application

${shipped.length} packages from the npm registry are part of the running application: those marked *web bundle* are compiled
into \`apps/web/dist\`, those marked *server runtime* are loaded from \`node_modules\` by the control plane and the runner. The
licence is the one that applies (for a choice such as \`MIT OR Apache-2.0\`, the option this project relies on is named).
Platform builds (\`*-darwin-arm64\` and similar) carry the licence of their package and are installed only on a matching machine.

| Package | Version | Licence | Used in | Copyright |
| --- | --- | --- | --- | --- |
${shipped
  .map(
    (p) =>
      `| ${cell(p.name)} | ${cell(p.version)} | ${cell(p.chosen)} | ${SCOPE_LABEL[p.scope]} | ${cell(
        p.copyright.join('; ') ||
          (p.platform
            ? `as ${PLATFORM_FAMILIES.find(([re]) => re.test(p.name))?.[1] ?? 'its package'}`
            : p.author
              ? `${p.author} (author; no copyright line in the licence file)`
              : '—'),
      )} |`,
  )
  .join('\n')}
`);
  const noText = shipped.filter((p) => !p.licenseTexts.length && !p.platform);
  out.push(`## Licence texts

Each text is reproduced once, followed by the packages that ship it verbatim. ${
    noText.length
      ? `These packages contain no licence file; the standard text of the licence they declare applies (MIT:
[LICENSES/MIT.txt](LICENSES/MIT.txt), Apache-2.0: [LICENSES/Apache-2.0.txt](LICENSES/Apache-2.0.txt)) with the copyright of their
author: ${noText.map((p) => `\`${p.name}@${p.version}\` (${p.chosen}${p.author ? `, ${p.author}` : ''})`).join(', ')}.`
      : ''
  }
`);
  const ordered = [...groups.entries()].sort(
    (a, b) =>
      [...a[1].licenses].join().localeCompare([...b[1].licenses].join()) ||
      a[0].localeCompare(b[0]),
  );
  for (const [hash, group] of ordered) {
    out.push(`### ${[...group.licenses].sort().join(', ')} (text ${hash.slice(0, 12)})

Used by: ${group.packages.map((p) => `\`${p}\``).join(', ')}.

${fence(group.text)}
`);
  }
  const withNotice = shipped.filter((p) => p.notices.length);
  out.push(`## NOTICE files

The Apache License 2.0 asks that a package's NOTICE file travel with it. ${
    withNotice.length ? 'These are reproduced verbatim.' : 'None of the shipped packages has one.'
  }
`);
  for (const p of withNotice)
    for (const n of p.notices)
      out.push(`### ${p.name}@${p.version} (${n.file})\n\n${fence(n.text)}\n`);
  out.push(`## Development and build tools (not distributed)

These ${dev.length} packages are used to build, test and lint the project. They are not part of the built application and no
notice is needed for them; they are listed so that every package in \`pnpm-lock.yaml\` has a reviewed licence. Packages under
the MPL-2.0 (\`axe-core\`, \`@axe-core/playwright\`, \`lightningcss\` and its platform builds) are used unmodified.

| Package | Version | Licence |
| --- | --- | --- |
${dev.map((p) => `| ${cell(p.name)} | ${cell(p.version)} | ${cell(p.chosen)} |`).join('\n')}
`);
  return `${out.join('\n').trimEnd()}\n`;
}

const purl = (name, version) =>
  `pkg:npm/${name.startsWith('@') ? `%40${name.slice(1)}` : name}@${encodeURIComponent(version)}`;

/** A CycloneDX 1.5 SBOM of the shipped packages. Deterministic: no timestamp, serial number derived from the content. */
export function renderSbom(packages, { name, version }) {
  const components = packages
    .filter((p) => p.scope !== 'dev')
    .map((p) => {
      const component = {
        type: 'library',
        'bom-ref': purl(p.name, p.version),
        name: p.name,
        version: p.version,
        purl: purl(p.name, p.version),
        scope: p.platform ? 'optional' : 'required',
      };
      if (p.integrity?.startsWith('sha512-'))
        component.hashes = [
          { alg: 'SHA-512', content: Buffer.from(p.integrity.slice(7), 'base64').toString('hex') },
        ];
      component.licenses =
        /^[A-Za-z0-9.+-]+$/.test(p.chosen ?? '') && !p.chosen.startsWith('LicenseRef-')
          ? [{ license: { id: p.chosen } }]
          : p.chosen?.startsWith('LicenseRef-')
            ? [{ license: { name: p.chosen } }]
            : [{ expression: p.chosen }];
      if (p.copyright.length) component.copyright = p.copyright.join('; ');
      component.properties = [{ name: 'aether:used-in', value: SCOPE_LABEL[p.scope] }];
      return component;
    });
  const body = {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: {
      tools: { components: [{ type: 'application', name: 'scripts/oss/third-party-notices.mjs' }] },
      component: {
        type: 'application',
        'bom-ref': `pkg:github/haotool/aether-office@${version}`,
        name,
        version,
        licenses: [{ license: { id: 'MIT' } }],
        purl: `pkg:github/haotool/aether-office@${version}`,
      },
    },
    components,
  };
  const digest = createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const serial = `urn:uuid:${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
  return `${JSON.stringify({ bomFormat: body.bomFormat, specVersion: body.specVersion, serialNumber: serial, ...body }, null, 2)}\n`;
}

export const INVENTORY_BEGIN =
  '<!-- BEGIN GENERATED: npm-inventory (scripts/oss/third-party-notices.mjs) -->';
export const INVENTORY_END = '<!-- END GENERATED: npm-inventory -->';

/** The generated npm table of docs/legal/inventory.md. */
export function renderInventory(packages) {
  const counts = new Map();
  for (const p of packages) {
    const key = `${p.scope === 'dev' ? 'dev' : 'shipped'} ${p.chosen}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const summary = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([k, n]) => `${k}: ${n}`)
    .join('; ');
  const verified = (p) =>
    p.platform
      ? 'platform build (family licence)'
      : EXCEPTIONS[p.name]
        ? 'recorded decision'
        : p.fileLicense
          ? `${p.licenseTexts[0].file} reads as ${p.fileLicense}`
          : p.licenseTexts.length
            ? `${p.licenseTexts[0].file} (text not auto-recognised)`
            : 'no licence file; package.json only';
  return `${INVENTORY_BEGIN}

${packages.length} packages in \`pnpm-lock.yaml\` (${packages.filter((p) => p.scope !== 'dev').length} shipped). By scope and
licence: ${summary}.

| Package | Version | Declared (package.json) | Applies | Used in | Verified against |
| --- | --- | --- | --- | --- | --- |
${packages
  .map(
    (p) =>
      `| ${cell(p.name)} | ${cell(p.version)} | ${cell(p.platform ? '(platform build)' : (p.declared ?? '—'))} | ${cell(p.chosen)} | ${SCOPE_LABEL[p.scope]} | ${cell(verified(p))} |`,
  )
  .join('\n')}

${INVENTORY_END}`;
}

export function spliceInventory(document, table) {
  const start = document.indexOf(INVENTORY_BEGIN);
  const end = document.indexOf(INVENTORY_END);
  if (start === -1 || end === -1)
    throw new Error('docs/legal/inventory.md has no generated-table markers');
  return document.slice(0, start) + table + document.slice(end + INVENTORY_END.length);
}

// ------------------------------------------------------------------------------------------------------------------ CLI

/** The committed, generated files. The SBOM is not committed (it changes with every dependency bump); `--sbom <file>`
 * writes it for a release. */
export function outputs(root, packages = collect(root)) {
  const inventoryPath = path.join(root, 'docs/legal/inventory.md');
  return {
    packages,
    files: {
      'THIRD_PARTY_NOTICES.md': renderNotices(packages),
      'docs/legal/inventory.md': spliceInventory(
        readFileSync(inventoryPath, 'utf8'),
        renderInventory(packages),
      ),
    },
  };
}

function main() {
  const { values } = parseArgs({
    options: {
      check: { type: 'boolean', default: false },
      sbom: { type: 'string' },
      root: { type: 'string', default: process.cwd() },
    },
  });
  const root = path.resolve(values.root);
  const { packages, files } = outputs(root);
  if (values.sbom) {
    const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    writeFileSync(
      path.resolve(values.sbom),
      renderSbom(packages, { name: manifest.name, version: manifest.version }),
    );
    process.stdout.write(`Wrote ${values.sbom}.\n`);
  }
  const problems = policyProblems(packages);
  const stale = Object.entries(files)
    .filter(
      ([file, content]) =>
        !existsSync(path.join(root, file)) ||
        readFileSync(path.join(root, file), 'utf8') !== content,
    )
    .map(([file]) => file);
  if (!values.check)
    for (const [file, content] of Object.entries(files))
      writeFileSync(path.join(root, file), content);
  const shipped = packages.filter((p) => p.scope !== 'dev').length;
  process.stdout.write(`${packages.length} locked packages, ${shipped} shipped.\n`);
  for (const problem of problems) process.stdout.write(`FAIL ${problem}\n`);
  if (values.check)
    for (const file of stale)
      process.stdout.write(`FAIL ${file} is out of date: run pnpm run notices\n`);
  else if (stale.length) process.stdout.write(`Wrote ${stale.join(', ')}.\n`);
  process.exit(problems.length || (values.check && stale.length) ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
