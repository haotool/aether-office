import type { Engagement } from '../environment/interplay.js';
import type { OfficeSceneProps } from '../scene/scene-props.js';
import type { PoseApi } from '../core/use-pose-cues.js';
import type { SceneInteraction } from '../core/use-scene-interaction.js';
import type { MemberActions } from './SquadMember.js';

export type SquadSceneContext = {
  props: Pick<
    OfficeSceneProps,
    'agents' | 'quality' | 'reducedMotion' | 'selectedId' | 'onSelect' | 'onFailure' | 'squadPrefs'
  >;
  floor: number;
  exploded: boolean;
  compact: boolean;
  zh: boolean;
  hover: { id: string | null; start: (id: string) => void; end: (id: string) => void };
  ix: SceneInteraction;
  pose: PoseApi;
  fly: MemberActions['onFly'];
  engagements: ReadonlyMap<string, readonly Engagement[]>;
  elements: Map<string, HTMLElement>;
};
