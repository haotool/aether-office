import type { ModelEntry } from '@aether/contracts';

/** The chip text: "Opus 5.5", or "Opus 5.5 · medium" on the chosen one. */
export const chipText = (model: ModelEntry, effort?: string) =>
  effort ? `${model.label} · ${effort}` : model.label;
