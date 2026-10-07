// What the scene hands the squad layers: its own state (the floor on view, the hover, the label table) and its interaction,
// in one object, so the scene mounts the layers with one line each and the layers pick what they need.
import type { Engagement } from '../interplay.js';
import type { OfficeSceneProps } from '../scene-props.js';
import type { PoseApi } from '../use-pose-cues.js';
import type { SceneInteraction } from '../use-scene-interaction.js';
import type { MemberActions } from './SquadMember.js';

export type SquadSceneContext = {
  props: Pick<
    OfficeSceneProps,
    'agents' | 'quality' | 'reducedMotion' | 'selectedId' | 'onSelect' | 'onFailure' | 'squadPrefs'
  >;
  /** The floor on view, and whether the building is spread apart (every floor shows). */
  floor: number;
  exploded: boolean;
  compact: boolean;
  zh: boolean;
  hover: { id: string | null; start: (id: string) => void; end: (id: string) => void };
  ix: SceneInteraction;
  /** The pose cues of every member (see use-pose-cues.ts). */
  pose: PoseApi;
  fly: MemberActions['onFly'];
  engagements: ReadonlyMap<string, readonly Engagement[]>;
  /** The scene's table of label elements: the zone labels' buttons (see SquadDom) are found there and projected. */
  elements: Map<string, HTMLElement>;
};
