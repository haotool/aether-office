import { ProjectedBoxes } from './ProjectedBoxes.js';
import { SceneBridgeProbe } from './SceneBridge.js';
import { SeatGhost } from './SeatGhost.js';
import type { SceneInteraction } from '../core/use-scene-interaction.js';

export function InteractionProjections({
  ix,
  exploded,
}: {
  ix: SceneInteraction;
  exploded: boolean;
}) {
  return (
    <>
      <SceneBridgeProbe bridge={ix.bridge} />
      {ix.seatDrag.drag && <SeatGhost drag={ix.seatDrag.drag} exploded={exploded} />}
      <ProjectedBoxes
        anchors={ix.hover ? ix.anchorsOf([ix.hover.agent.id]) : []}
        elements={ix.cardElements}
        placement="above"
      />
      <ProjectedBoxes
        anchors={ix.menuAgent ? ix.anchorsOf([ix.menuAgent.id]) : []}
        elements={ix.menuElements}
        placement="side"
      />
      <ProjectedBoxes anchors={ix.spriteAnchors} elements={ix.spriteElements} placement="above" />
    </>
  );
}
