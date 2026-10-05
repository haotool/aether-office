// What the rest of the app needs to know about the office without drawing it. This entry pulls in no 3D engine, so
// pages that only place members or classify sessions do not load Three.js.
export { FLOORS, FLOOR_CAPACITY, defaultLayout, floorZones, seatAt, zones } from './layout.js';
export { apparitionOf, type Apparition } from './animal-states.js';
export type { SceneMessage } from './carriers.js';
export type { BranchInfo, Quality } from './scene-types.js';
export type { ScreenFacts } from './screen-facts.js';
export type { PerfReport } from './perf.js';
export type { Pulse, PulseKind } from './director.js';
