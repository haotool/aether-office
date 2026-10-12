// A synthetic, labelled corpus of sessions: nothing here comes from a real session. Cases are written from how such
// work looks (file kinds, command families, branch names, subagent types), not from the classifier's own keyword lists.
export type ToolCall = { tool: string; target: string | null };
export type CorpusCase = {
  name: string;
  expect: string;
  title?: string;
  prompt?: string;
  branch?: string;
  repo?: string;
  actions?: ToolCall[];
  subagents?: string[];
};

export const edit = (...paths: string[]): ToolCall[] =>
  paths.map((target) => ({ tool: 'Edit', target }));
export const read = (...paths: string[]): ToolCall[] =>
  paths.map((target) => ({ tool: 'Read', target }));
export const run = (...commands: string[]): ToolCall[] =>
  commands.map((target) => ({ tool: 'Bash', target }));
export const tool = (name: string, target: string | null = null): ToolCall[] => [
  { tool: name, target },
];
