import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env['AETHER_HOME'] ??= mkdtempSync(join(tmpdir(), 'aether-test-home-'));
