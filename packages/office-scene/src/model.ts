// What the rest of the app needs to know about the office without drawing it. This entry pulls in no 3D engine, so
// pages that only place members or classify sessions do not load Three.js.
export {
  FLOORS,
  FLOOR_CAPACITY,
  defaultLayout,
  floorZones,
  floorsFrom,
  seatAt,
  zones,
} from './layout.js';
export {
  MAX_SQUAD_SEATS,
  placeSquads,
  podsOf,
  savedSquadOf,
  squadCapacity,
  squadLayout,
  squadObjectOf,
  type Pod,
  type SquadRect,
  type SquadRequest,
} from './squad/squad-layout.js';
export { apparitionOf, type Apparition } from './animal-states.js';
export { STAGGER_MS } from './departure.js';
export type { SceneMessage } from './carriers.js';
export type { BranchInfo, Quality } from './scene-types.js';
export type { ScreenFacts } from './screen-facts.js';
export type { FloorKpiBadge } from './FloorKpi.js';
export type { PerfReport } from './perf.js';
export type { Pulse, PulseKind } from './director.js';
export type { SceneSpeech, Utterance } from './Speech.js';
export {
  COMPACTION_LIVE_MS,
  compactionLabel,
  contextLevel,
  type ContextLevel,
  type SceneCompaction,
} from './context.js';
export {
  DEFAULT_LIFE_PREFS,
  LIFE_CATEGORIES,
  type LifeInput,
  type LifeMoment,
  type LifePrefs,
  type LifeSignal,
  type MemeCategory,
} from './life/signals.js';
export { ProviderMark, type MarkProvider } from './provider-marks.js';
export { EMOTES, type Emote, type EmoteId } from './emotes.js';
export type { SeatMove } from './use-seat-drag.js';
