import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Every test runs with its own AETHER_HOME, so nothing that resolves `~/.aether` by default can reach the real one.
// A test that needs another location sets the variable (or the narrower AETHER_APPROVALS_CONFIG / AETHER_HOOK_SPOOL).
process.env['AETHER_HOME'] ??= mkdtempSync(join(tmpdir(), 'aether-test-home-'));
