import { ProjectedBoxes } from './ProjectedBoxes.js';
import { SceneBridgeProbe } from './SceneBridge.js';
import { SeatGhost } from './SeatGhost.js';
import type { SceneInteraction } from '../core/use-scene-interaction.js';

/** The parts of the interaction layer that live inside the canvas: the bridge, the carried desk's ghost and the three kinds of box pinned to world points. */
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
