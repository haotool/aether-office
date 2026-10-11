import type { CustomCommand } from '@aether/contracts';
import type { SlashItem } from './composer-model.js';

type Builtin = { name: string; kind: 'text' | 'picker'; en: string; zh: string };
const text = (name: string, en: string, zh: string): Builtin => ({ name, kind: 'text', en, zh });
const picker = (name: string, en: string, zh: string): Builtin => ({
  name,
  kind: 'picker',
  en,
  zh,
});

/**
 * Names were found in the installed `claude` (2.1.289) and `codex` (0.160.0) programs; the descriptions are ours. A
 * `picker` command opens a list in the terminal itself, which this composer cannot answer: it is sent and the terminal
 * shows the list.
 */
export const BUILTIN_COMMANDS: Record<'claude' | 'codex', readonly Builtin[]> = {
  claude: [
    text('compact', 'Summarize the conversation to free context', '摘要對話以釋出 context'),
    text('clear', 'Start over with an empty conversation', '清空對話重新開始'),
    text('cost', 'Show what this session has cost', '顯示這個 session 的花費'),
    text('context', 'Show how full the context is', '顯示 context 用量'),
    text('status', 'Show version, model and account', '顯示版本、模型與帳號'),
    text('usage', 'Show plan usage and limits', '顯示方案用量與上限'),
    text('help', 'List the commands', '列出可用指令'),
    text('review', 'Review a pull request', '審查 pull request'),
    text('init', 'Create a CLAUDE.md for the project', '為專案建立 CLAUDE.md'),
    text('rename', 'Rename the session', '重新命名 session'),
    text('plan', 'Switch to plan mode', '切換為規劃模式'),
    text('fast', 'Toggle fast mode', '切換快速模式'),
    text('effort', 'Set the effort level (low, medium, high)', '設定 effort 等級'),
    text('add-dir', 'Add a working directory', '加入工作目錄'),
    text('copy', 'Copy the last reply', '複製最後一則回覆'),
    picker('model', 'Pick the model', '選模型'),
    picker('resume', 'Resume another session', '接續其他 session'),
    picker('config', 'Open the settings', '開啟設定'),
    picker('login', 'Sign in', '登入'),
    picker('logout', 'Sign out', '登出'),
    picker('permissions', 'Edit permission rules', '編輯權限規則'),
    picker('memory', 'Edit memory files', '編輯記憶檔'),
    picker('agents', 'Manage subagents', '管理子代理'),
    picker('mcp', 'Manage MCP servers', '管理 MCP 伺服器'),
    picker('hooks', 'View hooks', '檢視 hooks'),
    picker('rewind', 'Rewind the conversation', '回溯對話'),
    picker('diff', 'View the changes', '檢視變更'),
    picker('export', 'Export the conversation', '匯出對話'),
    picker('doctor', 'Check the installation', '檢查安裝'),
    picker('theme', 'Pick a theme', '選佈景'),
    picker('tasks', 'Manage background tasks', '管理背景工作'),
  ],
  codex: [
    text('compact', 'Summarize the conversation to free context', '摘要對話以釋出 context'),
    text('clear', 'Clear the screen and start a new chat', '清除畫面並開新對話'),
    text('new', 'Start a new chat', '開新對話'),
    text('status', 'Show model, approvals and token use', '顯示模型、核准設定與 token 用量'),
    text('review', 'Review the working tree changes', '審查工作區變更'),
    text('init', 'Create an AGENTS.md for the project', '為專案建立 AGENTS.md'),
    text('diff', 'Show the Git diff', '顯示 Git diff'),
    text('rename', 'Rename the session', '重新命名 session'),
    text('plan', 'Switch to plan mode', '切換為規劃模式'),
    text('fast', 'Toggle fast mode', '切換快速模式'),
    text('copy', 'Copy the last reply', '複製最後一則回覆'),
    picker('model', 'Pick the model and effort', '選模型與 effort'),
    picker('permissions', 'Choose what Codex may do', '選擇 Codex 的權限'),
    picker('resume', 'Resume another session', '接續其他 session'),
    picker('fork', 'Fork a session', '分叉 session'),
    picker('mcp', 'List MCP servers', '列出 MCP 伺服器'),
    picker('skills', 'Browse skills', '瀏覽 skills'),
    picker('agents', 'Manage agents', '管理 agents'),
    picker('hooks', 'View hooks', '檢視 hooks'),
    picker('theme', 'Pick a theme', '選佈景'),
    picker('logout', 'Sign out', '登出'),
  ],
};

export function slashItems(
  provider: 'claude' | 'codex',
  custom: readonly CustomCommand[],
): SlashItem[] {
  const builtin = BUILTIN_COMMANDS[provider].map((c): SlashItem => ({
    id: `builtin:${c.name}`,
    name: c.name,
    description: { en: c.en, 'zh-TW': c.zh },
    source: 'builtin',
    kind: c.kind,
  }));
  const taken = new Set(builtin.map((c) => c.name));
  return [
    ...builtin,
    ...custom
      .filter((c) => !taken.has(c.name))
      .map((c): SlashItem => ({
        id: `${c.source}:${c.kind}:${c.name}`,
        name: c.name,
        description: c.description,
        source: c.source,
        kind: c.kind,
      })),
  ];
}
