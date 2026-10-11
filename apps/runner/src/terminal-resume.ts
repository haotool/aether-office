import { realpathSync } from 'node:fs';
import type { TerminalResume } from '@aether/contracts';
import type { PtyProfile } from './pty.js';

/**
 * Only a profile that is exactly the provider's own CLI with no arguments may be extended; a hand-written profile keeps
 * what its owner wrote, and the session id is a positional argument, never a flag.
 */
export function resumeProfile(
  profile: PtyProfile,
  resume: TerminalResume | undefined,
  binaries: { claude?: string | undefined; codex?: string | undefined },
): PtyProfile {
  if (!resume) return profile;
  const binary = binaries[resume.provider];
  if (profile.args.length || !binary || realpathSync(binary) !== realpathSync(profile.binary))
    throw new Error('TERMINAL_RESUME_UNSUPPORTED');
  const args =
    resume.provider === 'claude'
      ? ['--resume', resume.sessionId, ...(resume.fork ? ['--fork-session'] : [])]
      : [resume.fork ? 'fork' : 'resume', resume.sessionId];
  return { ...profile, args };
}
