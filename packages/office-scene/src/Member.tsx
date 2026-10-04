import type { Agent, Layout } from '@aether/contracts';
import { DEPARTMENTS } from '@aether/kernel';
import { Animal } from './Animal.js';
import type { Apparition } from './animal-states.js';
import { MemberScreen } from './MemberScreen.js';
import { AGENT_OFFSET, floorY } from './scene-geometry.js';
import type { Quality } from './scene-types.js';

type Desk = Layout['objects'][number];

/** One member at a desk: its screen, its character (and a jiangshi behind the chair when zombies are under it). */
export function Member({
  agent,
  desk,
  exploded,
  role,
  apparition,
  zombie,
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
  apparition: Apparition | undefined;
  zombie: boolean;
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
  return (
    <group position={[desk.x, baseY, desk.z]} rotation={[0, (desk.rotation * Math.PI) / 2, 0]}>
      <MemberScreen
        role={role}
        member={agent.id}
        accent={DEPARTMENTS[desk.floor ?? 0]?.accent ?? '#43e6df'}
        activity={agent.activity}
      />
      <group
        position={[0, 0, 0.86]}
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
        <Animal
          agent={agent}
          apparition={apparition}
          selected={selected}
          reducedMotion={reducedMotion}
          quality={quality}
          light={light}
          onError={onFailure}
        />
        {zombie && (
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
