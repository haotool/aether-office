import { stat } from 'node:fs/promises';
import type { LocalSession } from '@aether/contracts';
import { readEdge } from './file-edge.js';
import { sessionFile } from './local-sessions.js';
import { parseTranscript } from './session-transcript.js';

/**
 * The last thing each running session was told and the last thing it answered, for the speech bubbles over the
 * members' heads. Only the tail of a transcript is read, text is already redacted by the transcript parser, each text is
 * cut on a character boundary, and nothing is stored beyond a per-file cache keyed by (mtime, size).
 */
const TAIL_BYTES = 128 * 1024;
const MAX_TEXT = 400;
export const MAX_SPEECH_SESSIONS = 40;

export type Utterance = { text: string; at: number | null };
export type Speech = { user: Utterance | null; assistant: Utterance | null };

const cut = (text: string) => {
  const chars = Array.from(text); // code points: never half of a surrogate pair
  return chars.length > MAX_TEXT ? `${chars.slice(0, MAX_TEXT).join('')}…` : text;
};

const cache = new Map<string, { mtimeMs: number; size: number; speech: Speech }>();
export const resetSpeechCache = () => cache.clear();

export async function readSpeech(provider: 'claude' | 'codex', file: string): Promise<Speech> {
  const { mtimeMs, size } = await stat(file);
  const hit = cache.get(file);
  if (hit && hit.mtimeMs === mtimeMs && hit.size === size) return hit.speech;
  const { entries } = parseTranscript(provider, await readEdge(file, 'tail', TAIL_BYTES));
  const latest = (role: 'user' | 'assistant'): Utterance | null => {
    const e = entries.findLast((x) => x.role === role && x.text);
    return e ? { text: cut(e.text), at: e.at } : null;
  };
  const speech = { user: latest('user'), assistant: latest('assistant') };
  cache.set(file, { mtimeMs, size, speech });
  return speech;
}

/** Speech by session key for the sessions whose process is running (at most MAX_SPEECH_SESSIONS). */
export async function runningSpeech(sessions: readonly LocalSession[]) {
  const out: Record<string, Speech> = {};
  const live = new Set<string>();
  await Promise.all(
    sessions
      .filter((s) => s.process === 'running')
      .slice(0, MAX_SPEECH_SESSIONS)
      .map(async (s) => {
        const found = sessionFile(s.key);
        if (!found) return;
        live.add(found.file);
        try {
          out[s.key] = await readSpeech(found.provider, found.file);
        } catch {
          /* the transcript vanished between the scan and the read */
        }
      }),
  );
  for (const file of cache.keys()) if (!live.has(file)) cache.delete(file);
  return out;
}
