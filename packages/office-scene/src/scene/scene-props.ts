import type { ReactNode } from 'react';
import type { Agent, Layout } from '@aether/contracts';
import type { Apparition } from '../animals/animal-states.js';
import type { SceneMessage } from '../environment/carriers.js';
import type { SceneCompaction } from '../environment/context.js';
import type { Pulse } from '../environment/director.js';
import type { FloorKpiBadge } from '../components/FloorKpi.js';
import type { LifeInput } from '../life/signals.js';
import type { PerfReport } from '../perf/perf.js';
import type { BranchInfo, Quality } from './scene-types.js';
import type { ScreenFacts } from '../screen/screen-facts.js';
import type { StalkCommit } from '../core/stalk-layout.js';
import type { SceneSpeech } from '../components/Speech.js';
import type { SquadInput } from '../squad/squad-model.js';
import type { SquadPrefs } from '../squad/SquadLayer.js';
import type { SeatMove } from '../core/use-seat-drag.js';
import type { CharacterMenuContext, GroupBarContext } from '../core/use-scene-interaction.js';

export type OfficeSceneProps = {
  agents: Agent[];
  layout: Layout | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  quality: Quality;
  /** The most frames a second the scene draws; absent, it draws as often as the screen asks. */
  fpsCap?: number | undefined;
  reducedMotion: boolean;
  locale: 'zh-TW' | 'en';
  focus: string;
  onFailure: () => void;
  /**
   * The GPU took the WebGL context away (iOS does it when a page sits in the background). Given, the page decides what
   * to show and may remount the scene for a new context; without it a lost context is a plain `onFailure`.
   */
  onContextLost?: () => void;
  onContextRestored?: () => void;
  messages?: readonly SceneMessage[];
  onMessageUnreachable?: (messageId: string, recipientId: string) => void;
  onUserCamera?: () => void;
  roleOf?: (agent: Agent) => string;
  screens?: Readonly<Record<string, ScreenFacts>>;
  intensity?: Readonly<Record<string, 0 | 1 | 2 | 3>>;
  branchOf?: (agent: Agent) => BranchInfo | null;
  apparitions?: Readonly<Record<string, Apparition>>;
  zombies?: Readonly<Record<string, number>>;
  leaving?: Readonly<Record<string, number>>;
  unreadIds?: ReadonlySet<string>;
  pulses?: readonly Pulse[];
  tethers?: readonly { parent: string; child: string }[];
  attention?: Readonly<Record<string, string>>;
  names?: Readonly<Record<string, { title: string; tag: string; repo: string }>>;
  doing?: Readonly<Record<string, string>>;
  speech?: Readonly<Record<string, SceneSpeech>>;
  beanstalk?: readonly StalkCommit[] | null;
  compactions?: Readonly<Record<string, SceneCompaction>>;
  autoCamera?: boolean;
  onToggleAuto?: () => void;
  compact?: boolean;
  paused?: boolean;
  onPerfReport?: (report: PerfReport) => void;
  perfFrames?: number;
  characterMenu?: (context: CharacterMenuContext) => ReactNode;
  groupBar?: (context: GroupBarContext) => ReactNode;
  canArrange?: boolean;
  onMoveSeat?: (move: SeatMove) => void;
  overlay?: ReactNode;
  floorKpi?: readonly (FloorKpiBadge | null)[];
  onOpenFloorKpi?: (floor: number) => void;
  /** Office life: the signals the page derived from real sessions, the person's settings and, for a contact sheet, a preview. Decorative. */
  life?: LifeInput;
  squads?: readonly SquadInput[];
  squadPrefs?: SquadPrefs;
};
