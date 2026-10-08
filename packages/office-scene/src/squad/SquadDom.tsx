import { useEffect, useState } from 'react';
import { ZONE_OFFSET, floorY } from '../scene/scene-geometry.js';
import { beamRate } from './beam-rate.js';
import { beamBasis } from './beam-readout.js';
import type { DrawSquad } from './squad-draw.js';
import { zoneBadge, zoneName } from './squad-text.js';
import type { SquadSceneContext } from './squad-scene.js';
import type { SquadFrame } from './use-squad.js';

/** Over the front edge of the zone, at the floor, where the floor zones' own labels are. */
const LABEL_LIFT = 0.14;
/** Columns the label's box takes up (the projection keeps two labels from overlapping). */
const LABEL_WIDTH = 96;

/** The id a squad's label has in the scene's table of label elements. */
const labelId = (supervisor: string) => `squad:${supervisor}`;

/** Where each squad's label is projected from: over the front edge of its zone. Pure. */
export function squadLabelsOf(squads: readonly DrawSquad[], exploded: boolean) {
  return squads.map((s) => ({
    id: labelId(s.supervisor),
    x: s.x,
    y: floorY(s.floor, exploded) + LABEL_LIFT,
    z: s.z + s.depth / 2 + 0.35,
    width: LABEL_WIDTH,
  }));
}

/** How often the beam readouts are looked at again; a label's text changes only when its words do. */
const READOUT_MS = 1000;

/** The beam's readout of each squad ("~12K tokens/min (based on tokens)"), re-read each second, state only when it changes. */
function useBeamReadouts(squads: readonly DrawSquad[], frame: SquadFrame, zh: boolean) {
  const [texts, setTexts] = useState<Readonly<Record<string, string | null>>>({});
  useEffect(() => {
    const read = () => {
      const now = Date.now();
      const next = Object.fromEntries(
        squads.map((s) => [
          s.supervisor,
          beamBasis(zh, beamRate(frame.state.current.zones[s.supervisor], now)),
        ]),
      );
      setTexts((old) =>
        Object.keys(next).length === Object.keys(old).length &&
        Object.entries(next).every(([k, v]) => old[k] === v)
          ? old
          : next,
      );
    };
    read();
    const timer = setInterval(read, READOUT_MS);
    return () => clearInterval(timer);
  }, [squads, frame, zh]);
  return texts;
}

/**
 * The squads' part of the page's own DOM (in the scene's label layer, next to the zone labels): a focusable button for
 * each zone, "Squad of {parent}, 3 working", which flies the camera there. Who joined and who left (relation rows R1 and
 * R6) is said through the scene's one aria log (see use-squad.ts). The beam's rate, with where it comes from, is the
 * button's tooltip and part of its accessible name. The scene projects the buttons.
 */
export function SquadDom({ squad, scene }: { squad: SquadFrame; scene: SquadSceneContext }) {
  const { floor, exploded, compact, zh, elements } = scene;
  const { agents } = scene.props;
  const frame = squad;
  const onFly = scene.fly;
  const nameOf = (supervisor: string) =>
    agents.find((a) => a.id === supervisor)?.name ?? supervisor;
  const squads = frame.squads.filter((s) => exploded || s.floor === floor);
  const members = Object.values(frame.state.current.members);
  const readouts = useBeamReadouts(frame.squads, frame, zh);
  return (
    <>
      {!compact &&
        squads.map((s) => {
          const mine = members.filter(
            (m) => m.supervisor === s.supervisor && m.phase !== 'leaving',
          );
          const working = mine.filter((m) => m.working || m.waiting).length;
          return (
            <button
              type="button"
              className="zone-label squad-label"
              key={s.supervisor}
              aria-label={zoneName(
                zh,
                nameOf(s.supervisor),
                working,
                s.overflow,
                readouts[s.supervisor] ?? null,
              )}
              title={readouts[s.supervisor] ?? undefined}
              ref={(node) => {
                if (node) elements.set(labelId(s.supervisor), node);
                else elements.delete(labelId(s.supervisor));
              }}
              onClick={() => onFly([s.x, floorY(s.floor, exploded), s.z], ZONE_OFFSET)}
            >
              {zoneBadge(zh, mine.length, s.overflow)}
            </button>
          );
        })}
    </>
  );
}
