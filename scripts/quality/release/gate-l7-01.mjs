#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const dirty = execFileSync('git', ['-C', root, 'status', '--porcelain'], {
  encoding: 'utf8',
}).trim();
process.exit(dirty ? 1 : 0);
