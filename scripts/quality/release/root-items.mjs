import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

function gitWorkTree(root) {
  try {
    execFileSync('git', ['-C', root, 'rev-parse', '--git-dir'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** @param {string} root */
export function releaseTreeTopLevel(root) {
  const out = execFileSync(
    'git',
    ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8' },
  );
  const names = new Set();
  for (const entry of out.split('\0').filter(Boolean)) {
    const top = entry.split('/')[0];
    if (top !== '.git') names.add(top);
  }
  return [...names].sort();
}

/** @param {string} root */
export function listRootItems(root) {
  if (gitWorkTree(root)) return releaseTreeTopLevel(root);
  return readdirSync(root)
    .filter((name) => name !== '.git')
    .sort();
}
