import { appendFile, mkdir, utimes, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// Synthetic Claude Code transcripts in the on-disk format: a session `<project>/<session>.jsonl` and its subagents
// `<project>/<session>/subagents/agent-<id>.jsonl` (+ `.meta.json`). Content is invented; only the shapes are real.
export const FRESH = { input: 10, cacheWrite: 20, cacheRead: 1000, output: 5 };
/** Tokens one `assistant` line counts as spent: new input, cache writes and output (cache reads are not counted). */
export const FRESH_PER_MESSAGE = FRESH.input + FRESH.cacheWrite + FRESH.output;

const line = (v: unknown) => `${JSON.stringify(v)}\n`;
let sequence = 0;

export function assistantLine(
  agentId: string,
  content: unknown[],
  at: Date,
  usage = { ...FRESH },
): string {
  sequence++;
  return line({
    parentUuid: null,
    isSidechain: true,
    agentId,
    type: 'assistant',
    message: {
      model: 'claude-test-1',
      id: `msg_${agentId}_${sequence}`,
      type: 'message',
      role: 'assistant',
      content,
      usage: {
        input_tokens: usage.input,
        cache_creation_input_tokens: usage.cacheWrite,
        cache_read_input_tokens: usage.cacheRead,
        output_tokens: usage.output,
      },
    },
    uuid: `u-${sequence}`,
    timestamp: at.toISOString(),
    cwd: '/synthetic',
  });
}

export const textBlock = (text: string) => [{ type: 'text', text }];
export const toolBlock = (name: string, id = `toolu_${sequence}`) => [
  { type: 'tool_use', id, name, input: {} },
];

export type SubagentFixture = {
  id: string;
  at?: Date;
  type?: string;
  description?: string;
  toolUseId?: string;
  requestShape?: 'foreground' | 'background';
  lines?: string[];
};

/** A session with its transcript, and the folder of its subagents. Returns the session's file. */
export async function writeSession(home: string, session = 'sess-1'): Promise<string> {
  const file = join(home, '.claude/projects/-synthetic', `${session}.jsonl`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(
    file,
    line({ type: 'user', cwd: home, message: { role: 'user', content: 'hi' } }),
  );
  return file;
}

export async function writeSubagent(parentFile: string, f: SubagentFixture): Promise<string> {
  const dir = join(parentFile.replace(/\.jsonl$/, ''), 'subagents');
  await mkdir(dir, { recursive: true });
  const file = join(dir, `agent-${f.id}.jsonl`);
  const at = f.at ?? new Date();
  await writeFile(file, (f.lines ?? []).join(''));
  await writeFile(
    join(dir, `agent-${f.id}.meta.json`),
    JSON.stringify({
      agentType: f.type ?? 'general-purpose',
      description: f.description ?? 'Look into the thing',
      toolUseId: f.toolUseId ?? `toolu_spawn_${f.id}`,
      spawnDepth: 1,
      ...(f.requestShape ? { requestShape: f.requestShape } : {}),
    }),
  );
  await utimes(file, at, at);
  return file;
}

export async function append(file: string, text: string, at = new Date()): Promise<void> {
  await appendFile(file, text);
  await utimes(file, at, at);
}

/** A `tool_result` line of the parent's transcript for a call, as Claude Code writes it. */
export const toolResultLine = (toolUseId: string, isError: boolean) =>
  line({
    type: 'user',
    message: {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          content: 'synthetic output',
          is_error: isError,
          tool_use_id: toolUseId,
        },
      ],
    },
    timestamp: new Date().toISOString(),
  });
