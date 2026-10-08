// What the rest of the app needs to know about the office without drawing it. This entry pulls in no 3D engine, so
// pages that only place members or classify sessions do not load Three.js.
export {
  FLOORS,
  FLOOR_CAPACITY,
  assignSeats,
  defaultLayout,
  floorZones,
  floorsFrom,
  seatAt,
  zones,
  type Seat,
} from './environment/layout.js';
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
export { apparitionOf, type Apparition } from './animals/animal-states.js';
export { STAGGER_MS } from './animals/departure.js';
export type { SceneMessage } from './environment/carriers.js';
export type { BranchInfo, Quality } from './scene/scene-types.js';
export type { ScreenFacts } from './screen/screen-facts.js';
export type { FloorKpiBadge } from './components/FloorKpi.js';
export type { PerfReport } from './perf/perf.js';
export type { Pulse, PulseKind } from './environment/director.js';
export type { SceneSpeech, Utterance } from './components/Speech.js';
export { compactionLabel } from './environment/compaction-label.js';
export {
  COMPACTION_LIVE_MS,
  contextLevel,
  type ContextLevel,
  type SceneCompaction,
} from './environment/context.js';
export {
  DEFAULT_LIFE_PREFS,
  LIFE_CATEGORIES,
  type LifeInput,
  type LifeMoment,
  type LifePrefs,
  type LifeSignal,
  type MemeCategory,
} from './life/signals.js';
export { ProviderMark, type MarkProvider } from './core/provider-marks.js';
export { EMOTES, type Emote, type EmoteId } from './animals/emotes.js';
export type { SeatMove } from './core/use-seat-drag.js';
