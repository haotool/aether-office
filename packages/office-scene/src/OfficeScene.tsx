import type { OfficeSceneProps } from './scene-props.js';
import { PipWall } from './PipWall.js';
import { InteractionLayer } from './InteractionLayer.js';
import type {
  CharacterMenuContext,
  GroupBarContext,
  SceneActions,
} from './use-scene-interaction.js';
import { SceneBoundary } from './SceneRuntime.js';
import { SceneCanvas } from './SceneCanvas.js';
import { HudPanels, SceneCaptions, SpeechBubbles, WorldLabels } from './SceneOverlay.js';
import { useSceneModel } from './use-scene-model.js';

export type { OfficeSceneProps } from './scene-props.js';
export type { CharacterMenuContext, GroupBarContext, SceneActions };

export function OfficeScene(props: OfficeSceneProps) {
  const m = useSceneModel(props);
  const { wall, marks } = m.ix;
  return (
    <SceneBoundary onFailure={props.onFailure}>
      <div
        className="canvas-container"
        data-following={m.nav.following ?? undefined}
        ref={wall.container}
      >
        <SceneCanvas m={m} />
        {!m.warm && (
          <div className="scene-warming" role="status">
            {m.zh ? '準備場景…' : 'Preparing the scene…'}
          </div>
        )}
        {wall.feeds.length > 0 && (
          <PipWall
            feeds={wall.feeds}
            pinned={marks.pinned}
            agents={props.agents}
            doing={props.doing}
            intensity={props.intensity}
            zh={m.zh}
            onSelect={props.onSelect}
            onClose={m.ix.closeWall}
          />
        )}
        <WorldLabels m={m} />
        <InteractionLayer
          ix={m.ix}
          zh={m.zh}
          compact={m.compact}
          still={props.reducedMotion}
          characterMenu={props.characterMenu}
          groupBar={props.groupBar}
        />
        {props.overlay}
        <SpeechBubbles m={m} />
        <SceneCaptions m={m} />
        <HudPanels m={m} />
      </div>
    </SceneBoundary>
  );
}
