export const enModels = {
  modelsDetected: 'Detected models',
  modelsNote:
    'Read from the Claude Code and Codex caches on this machine. When the Codex cache is out of date, `codex debug models` is run to list its models (no model session is started). Nothing is written.',
  modelsEffort: 'Effort',
  modelsEffortDefault: 'Default',
  modelsRefresh: 'Refresh',
  modelsNone: 'No model list found',
  modelsAlias: 'Alias: the newest model of its family',
  modelsSourceCache: 'From the CLI cache',
  modelsSourceCli: 'From the CLI',
  modelsSourceFallback: 'Built-in aliases only',
  modelsStale: 'Out of date: open the CLI once to refresh it',
} as const;
