import {
  scoreSession,
  settle,
  type ToolCall,
  type ClassifyInput,
  type Settled,
} from '@aether/kernel';
import type { LocalSession } from '@aether/contracts';
import { redactSecrets } from '../platform/redaction.js';

const MAX_REMEMBERED = 2000;
const settled = new Map<string, Settled>();

type Inputs = Omit<ClassifyInput, 'actions'> & {
  transcript: readonly ToolCall[];
  hook: readonly ToolCall[];
};

export function roleOf(key: string, input: Inputs, now: number): LocalSession['classification'] {
  const actions = input.transcript.length ? input.transcript : input.hook;
  const scored = scoreSession({ ...input, actions });
  const { state, classification } = settle(settled.get(key), scored, now);
  if (settled.size >= MAX_REMEMBERED) settled.clear();
  settled.set(key, state);
  return {
    ...classification,
    evidence: classification.evidence.map((e) => redactSecrets(e).slice(0, 80)),
  };
}

export const resetRoles = () => settled.clear();
