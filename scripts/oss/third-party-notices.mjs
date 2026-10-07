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
// ------------------------------------------------------------------------------------------------------------------ CLI
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { collect, policyProblems } from './notices-packages.mjs';
import { renderInventory, renderNotices, renderSbom, spliceInventory } from './notices-render.mjs';
export * from './notices-policy.mjs';
export * from './notices-lockfile.mjs';
export * from './notices-licences.mjs';
export * from './notices-packages.mjs';
export * from './notices-render.mjs';

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
