import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export async function claudeSessionOf(
  home: string,
  process: { pid: number; startedAt: number },
): Promise<string | null> {
  try {
    const file = JSON.parse(
      await readFile(join(home, '.claude/sessions', `${process.pid}.json`), 'utf8'),
    ) as { pid?: unknown; sessionId?: unknown; startedAt?: unknown };
    return file.pid === process.pid &&
      typeof file.sessionId === 'string' &&
      UUID.test(file.sessionId) &&
      typeof file.startedAt === 'number' &&
      file.startedAt >= process.startedAt
      ? file.sessionId
      : null;
  } catch {
    return null;
  }
}
