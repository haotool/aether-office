import { expect, it } from 'vitest';
import { terminalResumeSchema } from '../../packages/contracts/src/index.js';
import { resumeProfile } from '../../apps/runner/src/terminal-resume.js';

const binary = process.execPath;
const profile = { binary, args: [], cwd: '/tmp' };
const id = '2c2f7d3e-5a1b-4c3d-9e8f-0a1b2c3d4e5f';

it('continues a session with the provider own command, and forks it', () => {
  const binaries = { claude: binary, codex: binary };
  const args = (provider: 'claude' | 'codex', fork: boolean) =>
    resumeProfile(profile, { provider, sessionId: id, fork }, binaries).args;
  expect(args('claude', false)).toEqual(['--resume', id]);
  expect(args('claude', true)).toEqual(['--resume', id, '--fork-session']);
  expect(args('codex', false)).toEqual(['resume', id]);
  expect(args('codex', true)).toEqual(['fork', id]);
  expect(resumeProfile(profile, undefined, binaries)).toBe(profile);
});

it('refuses a profile that is not exactly the provider CLI with no arguments', () => {
  const resume = { provider: 'claude', sessionId: id, fork: false } as const;
  expect(() => resumeProfile({ ...profile, args: ['--x'] }, resume, { claude: binary })).toThrow(
    'TERMINAL_RESUME_UNSUPPORTED',
  );
  expect(() => resumeProfile(profile, resume, { codex: binary })).toThrow(
    'TERMINAL_RESUME_UNSUPPORTED',
  );
  expect(() =>
    resumeProfile({ ...profile, binary: '/bin/sh' }, resume, { claude: binary }),
  ).toThrow('TERMINAL_RESUME_UNSUPPORTED');
});

it('takes a session id that cannot be read as a flag', () => {
  const ok = { provider: 'codex', fork: false };
  expect(terminalResumeSchema.safeParse({ ...ok, sessionId: id }).success).toBe(true);
  expect(terminalResumeSchema.safeParse({ ...ok, sessionId: '--dangerously-x' }).success).toBe(
    false,
  );
  expect(terminalResumeSchema.safeParse({ ...ok, sessionId: 'a b c d e f g h' }).success).toBe(
    false,
  );
});
