import type { ModelEntry } from '@aether/contracts';

export const chipText = (model: ModelEntry, effort?: string) =>
  effort ? `${model.label} · ${effort}` : model.label;
