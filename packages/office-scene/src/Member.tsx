import type { Agent, Layout } from '@aether/contracts';
import { DEPARTMENTS } from '@aether/kernel';
import { Animal } from './Animal.js';
import type { Apparition } from './animal-states.js';
import { DeskEffects } from './DeskEffects.js';
import { Departing } from './Departing.js';
import { SEAT_DEPTH, WALK_PACE, type Departure } from './departure.js';
import { MemberScreen } from './MemberScreen.js';
import type { ScreenFacts } from './screen-facts.js';
import { AGENT_OFFSET, floorY } from './scene-geometry.js';
import type { Quality } from './scene-types.js';

type Desk = Layout['objects'][number];

/** One member at a desk: its screen, its character (and a jiangshi behind the chair when zombies are under it). */
export function Member({
  agent,
  desk,
  exploded,
  role,
  facts,
  intensity,
  apparition,
  zombie,
  departure,
  selected,
  reducedMotion,
  quality,
  light,
  onSelect,
  onFly,
  onHoverStart,
  onHoverEnd,
  onFailure,
}: {
  agent: Agent;
  desk: Desk;
  exploded: boolean;
  role: string;
  facts: ScreenFacts | undefined;
  intensity: 0 | 1 | 2 | 3;
  apparition: Apparition | undefined;
  zombie: boolean;
  /** Sent home: the way out and when it begins. The member packs up, walks out and the desk is left empty. */
  departure: { plan: Departure; startAt: number } | undefined;
  selected: boolean;
  reducedMotion: boolean;
  quality: Quality;
  light: boolean;
  onSelect: (id: string) => void;
  onFly: (target: [number, number, number], offset: [number, number, number]) => void;
  onHoverStart: (id: string) => void;
  onHoverEnd: (id: string) => void;
  onFailure: () => void;
}) {
  const baseY = floorY(desk.floor ?? 0, exploded);
  const animal = {
    agent,
    selected,
    reducedMotion,
    quality,
    light,
    onError: onFailure,
  };
  return (
    <group position={[desk.x, baseY, desk.z]} rotation={[0, (desk.rotation * Math.PI) / 2, 0]}>
      <MemberScreen
        role={role}
        member={agent.id}
        accent={DEPARTMENTS[desk.floor ?? 0]?.accent ?? '#43e6df'}
        activity={agent.activity}
        facts={facts}
        theme={DEPARTMENTS[desk.floor ?? 0]?.id ?? 'product'}
        intensity={intensity}
      />
      <DeskEffects intensity={intensity} seed={agent.id} />
      <group
        position={[0, 0, SEAT_DEPTH]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(agent.id);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onSelect(agent.id);
          onFly([desk.x, baseY + 0.7, desk.z], AGENT_OFFSET);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHoverStart(agent.id);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          onHoverEnd(agent.id);
          document.body.style.cursor = '';
        }}
      >
        {departure ? (
          <Departing
            plan={departure.plan}
            startAt={departure.startAt}
            reducedMotion={reducedMotion}
            bag={apparition !== 'ghost'}
            bagColor={agent.color}
          >
            {(clip) => (
              <Animal
                {...animal}
                // A sleeping rabbit wakes as the member it is; a ghost has only its own way of going.
                apparition={clip && apparition === 'sleeping_rabbit' ? undefined : apparition}
                override={clip ?? undefined}
                pace={clip === 'walk' ? WALK_PACE : 1}
              />
            )}
          </Departing>
        ) : (
          <Animal {...animal} apparition={apparition} pace={1 + intensity * 0.4} />
        )}
        {zombie && !departure && (
          <Animal
            agent={agent}
            apparition="zombie"
            selected={false}
            reducedMotion={reducedMotion}
            quality={quality}
            light={light}
            onError={onFailure}
          />
        )}
      </group>
    </group>
  );
}
