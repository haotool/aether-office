import type { ReactNode } from 'react';
import type { Agent, Layout } from '@aether/contracts';
import type { Apparition } from './animal-states.js';
import type { SceneMessage } from './carriers.js';
import type { SceneCompaction } from './context.js';
import type { Pulse } from './director.js';
import type { PerfReport } from './perf.js';
import type { BranchInfo, Quality } from './scene-types.js';
import type { ScreenFacts } from './screen-facts.js';
import type { StalkCommit } from './stalk-layout.js';
import type { SceneSpeech } from './Speech.js';
import type { SeatMove } from './use-seat-drag.js';
import type { CharacterMenuContext, GroupBarContext } from './use-scene-interaction.js';

export type OfficeSceneProps = {
  agents: Agent[];
  layout: Layout | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  quality: Quality;
  reducedMotion: boolean;
  locale: 'zh-TW' | 'en';
  focus: string;
  onFailure: () => void;
  messages?: readonly SceneMessage[];
  onMessageUnreachable?: (messageId: string, recipientId: string) => void;
  /** Fired when the user drags, zooms or pans the camera, so automation like a tour can yield. */
  onUserCamera?: () => void;
  /** Which engineering role an agent works in; picks the art on its screen. */
  roleOf?: (agent: Agent) => string;
  /** What each member is really doing, by id: drawn on that member's screen instead of the role's decorative art. */
  screens?: Readonly<Record<string, ScreenFacts>>;
  /** How hard each working member is working, 0 to 3: faster typing, a streaming screen, and at the top a machine that smokes. */
  intensity?: Readonly<Record<string, 0 | 1 | 2 | 3>>;
  /** The Git branch an agent works on, drawn as a beam from its desk into the core (the default branch). */
  branchOf?: (agent: Agent) => BranchInfo | null;
  /** Members drawn as something else at their own seat: a sleeping rabbit, a ghost, a jiangshi (see animal-states). */
  apparitions?: Readonly<Record<string, Apparition>>;
  /** Members with zombie processes under them (id → how many): a jiangshi stands behind each one's chair as well. */
  zombies?: Readonly<Record<string, number>>;
  /** Members sent home, by id with the wall-clock moment each begins to leave: they pack up, walk to the elevator and are gone. */
  leaving?: Readonly<Record<string, number>>;
  /** Agents with something new for the user (waiting for them, or finished): their labels are marked. */
  unreadIds?: ReadonlySet<string>;
  /** Messages and subagent work in the last half minute: drawn between the members and cut to by the camera. */
  pulses?: readonly Pulse[];
  /** Each live subagent with its parent's member: drawn as a faint tether between their desks. */
  tethers?: readonly { parent: string; child: string }[];
  /** Members that want a person (forgotten, ownerless, zombies under them), by id with the reason in a few words. */
  attention?: Readonly<Record<string, string>>;
  /** What each member is doing right now, in a word or two (a tool, a state), shown by the member on screen. */
  doing?: Readonly<Record<string, string>>;
  /** The last prompt and reply of each running member, by id: two bubbles over the head of a few of them at a time. */
  speech?: Readonly<Record<string, SceneSpeech>>;
  /** Recent commits of the project's repository, newest first: drawn as a braid of glass up the building's core with a crown above the roof. */
  beanstalk?: readonly StalkCommit[] | null;
  /** Compactions happening now, by member id (the page drops each a few seconds after it begins): the effect, the chip. */
  compactions?: Readonly<Record<string, SceneCompaction>>;
  /** The camera runs itself (the director). Default on. */
  autoCamera?: boolean;
  onToggleAuto?: () => void;
  /** A phone: lighter rendering (no shadows, no antialiasing, a capped pixel ratio), few names and a minimal HUD. */
  compact?: boolean;
  /** Something covers the scene (a phone's full-height sheet): it stops drawing, and picks up where it was when uncovered. */
  paused?: boolean;
  /** When set, the scene renders continuously for a fixed sample and reports measured frame times. */
  onPerfReport?: (report: PerfReport) => void;
  /** Frames in the first perf sample (default 120). */
  perfFrames?: number;
  /** The action menu of one character, drawn by the page over the scene when the person opens it (click on the chosen one, right click, press and hold, Enter). */
  characterMenu?: (context: CharacterMenuContext) => ReactNode;
  /** The bar for the characters picked with Shift or a rectangle. */
  groupBar?: (context: GroupBarContext) => ReactNode;
  /** The person may rearrange seats (an owner or operator): Alt + drag carries a member's desk. */
  canArrange?: boolean;
  /** A desk was dropped on a seat the layout rules allow; the page saves it. */
  onMoveSeat?: (move: SeatMove) => void;
  /** Anything the page wants over the scene (a toast), placed in the scene's own box. */
  overlay?: ReactNode;
};
