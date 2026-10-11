import { isAbsolute, resolve } from 'node:path';
import { z } from 'zod';
import { codexRolloutVersion } from '@aether/providers';
import { hash, type Observation } from './observer-source.js';

// Record types seen in real 0.159.2 and 0.160.0 rollouts that carry no conversation content. Other rollout versions
// come from providers/generated/compat.json and are reported as unsupported_schema instead of being parsed on a guess.
const NON_CONVERSATION_RECORDS = [
  'turn_context',
  'event_msg',
  'compacted',
  'world_state',
  'token_usage_record',
  'inter_agent_communication_metadata',
];
const IGNORED_ITEMS = [
  'function_call_output',
  'custom_tool_call',
  'custom_tool_call_output',
  'web_search_call',
  'image_generation_call',
  'agent_message',
];
const metaSchema = z.object({
  id: z.string().min(1).max(200),
  cwd: z.string().refine(isAbsolute),
  cli_version: z.string().refine(codexRolloutVersion),
});
export const checkpointSchema = z.strictObject({
  identity: z.string(),
  offset: z.number().int().nonnegative(),
  prefixLength: z.number().int().min(0).max(256),
  prefixHash: z.string(),
  meta: metaSchema.nullable(),
  failure: z.enum(['unsupported_schema', 'limit_exceeded']).nullable(),
});
export type ObserverCheckpoint = z.infer<typeof checkpointSchema>;

const jsonObject = z.record(z.string(), z.unknown());
type Item = z.infer<typeof jsonObject>;

type LineOutcome = Observation | null | 'unsupported_schema';
const UNSUPPORTED = 'unsupported_schema';

function parseLine(line: Buffer): Item | null {
  try {
    return jsonObject.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(line)));
  } catch {
    return null;
  }
}

/** The `session_meta` line names the session and must belong to the project; a second one must be the same session. */
function acceptMeta(
  payload: unknown,
  checkpoint: ObserverCheckpoint,
  projectRoot: string,
): boolean {
  const meta = metaSchema.safeParse(payload);
  if (
    !meta.success ||
    resolve(meta.data.cwd) !== projectRoot ||
    (checkpoint.meta && checkpoint.meta.id !== meta.data.id)
  )
    return false;
  checkpoint.meta = meta.data;
  return true;
}

function messageText(p: Item): string | null {
  const content = z.array(jsonObject).safeParse(p['content']);
  if (!content.success) return null;
  return content.data
    .filter(
      (c) =>
        ['input_text', 'output_text'].includes(String(c['type'])) && typeof c['text'] === 'string',
    )
    .map((c) => c['text'])
    .join('\n')
    .slice(0, 16000);
}

function conversationRecord(
  p: Item,
  base: Pick<Observation, 'sourceId' | 'sessionId'>,
): LineOutcome {
  if (p['type'] === 'message') {
    if (!['user', 'assistant'].includes(String(p['role']))) return null;
    const text = messageText(p);
    if (text === null) return UNSUPPORTED;
    return text
      ? { ...base, kind: 'message', role: p['role'] as 'user' | 'assistant', text }
      : null;
  }
  if (p['type'] === 'function_call' && typeof p['name'] === 'string')
    return { ...base, kind: 'tool', role: 'assistant', text: p['name'].slice(0, 160) };
  return IGNORED_ITEMS.includes(String(p['type'])) ? null : UNSUPPORTED;
}

export function decodeLine(
  line: Buffer,
  offset: number,
  checkpoint: ObserverCheckpoint,
  projectRoot: string,
): LineOutcome {
  const parsed = parseLine(line);
  if (!parsed) return UNSUPPORTED;
  if (parsed['type'] === 'session_meta')
    return acceptMeta(parsed['payload'], checkpoint, projectRoot) ? null : UNSUPPORTED;
  if (!checkpoint.meta) return UNSUPPORTED;
  if (NON_CONVERSATION_RECORDS.includes(String(parsed['type']))) return null;
  if (parsed['type'] !== 'response_item') return UNSUPPORTED;
  const item = jsonObject.safeParse(parsed['payload']);
  if (!item.success) return UNSUPPORTED;
  const p = item.data;
  if (
    p['type'] === 'reasoning' ||
    (p['channel'] != null && !['final', 'commentary'].includes(String(p['channel'])))
  )
    return null;
  const base = {
    sourceId: hash(`${checkpoint.identity}:${offset}:${hash(line)}`),
    sessionId: checkpoint.meta.id,
  };
  return conversationRecord(p, base);
}
