import type { Agent } from '@aether/contracts';
import type { SceneSpeech } from '../components/Speech.js';

const SPEECH_AT_ONCE = 6;

/** Bubbles go to the selected member and the camera's subjects first, then the busiest working ones (not on a phone). */
export function pickSpeakers(input: {
  agents: readonly Agent[];
  speech: Readonly<Record<string, SceneSpeech>> | undefined;
  intensity: Readonly<Record<string, 0 | 1 | 2 | 3>> | undefined;
  selectedId: string | null;
  onShot: (id: string) => boolean;
  compact: boolean;
}): Agent[] {
  const { agents, speech, intensity, selectedId, onShot, compact } = input;
  return agents
    .filter((a) => speech?.[a.id])
    .map((a) => {
      const level = intensity?.[a.id] ?? 0;
      const rank =
        a.id === selectedId || onShot(a.id)
          ? 4
          : compact
            ? 0
            : Math.max(level, a.activity === 'working' ? 1 : 0);
      return { agent: a, rank };
    })
    .filter((s) => s.rank > 0)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, SPEECH_AT_ONCE)
    .map((s) => s.agent);
}
