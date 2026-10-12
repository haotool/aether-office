import type { Agent, Layout } from '@aether/contracts';
import { useMemo, useRef } from 'react';
import { Animal, type AnimalProps, type EmoteCue, type Ring } from '../animals/Animal.js';
import { createLongPress } from '../core/long-press.js';
import { characterEvents } from '../characters/character-events.js';
import type { Apparition } from '../animals/animal-states.js';
import { CompactionEffect } from './CompactionEffect.js';
import { ContextGauge } from './ContextGauge.js';
import { DeskEffects } from './DeskEffects.js';
import { Departing } from './Departing.js';
import { SEAT_DEPTH, WALK_PACE, type Departure } from '../animals/departure.js';
import { MemberScreen } from './MemberScreen.js';
import { DeskItems } from './DeskItems.js';
import { deskProfile } from '../desks/desk-profile.js';
import { LONG_QUIET_MINUTES, workMode } from '../environment/behavior.js';
import type { BehaviorScene } from '../core/use-micro-actions.js';
import { AttentionRing, ContactShadow, ScreenGlow } from './DeskGlow.js';
import { Poser } from './Poser.js';
import type { Engagement } from '../environment/interplay.js';
import type { TurnCue } from '../core/use-pose-cues.js';
import type { ScreenFacts } from '../screen/screen-facts.js';
import { ACTIVE, departmentAt, floorY } from '../scene/scene-geometry.js';
import type { SceneCompaction } from '../environment/context.js';
import type { Quality } from '../scene/scene-types.js';

const HEAD_Y = 1.75;

type Desk = Layout['objects'][number];

type MemberProps = {
  agent: Agent;
  desk: Desk;
  exploded: boolean;
  role: string;
  facts: ScreenFacts | undefined;
  intensity: 0 | 1 | 2 | 3;
  compaction: SceneCompaction | undefined;
  apparition: Apparition | undefined;
  zombie: boolean;
  departure: { plan: Departure; startAt: number } | undefined;
  engagements: readonly Engagement[] | undefined;
  attention: boolean;
  selected: boolean;
  ring: Ring | null;
  emote: EmoteCue | undefined;
  turn?: TurnCue | undefined;
  reducedMotion: boolean;
  quality: Quality;
  light: boolean;
  onActivate: (id: string, shift: boolean) => void;
  onMenu: (id: string) => void;
  onGrab: (id: string, event: PointerEvent) => boolean;
  onSelect: (id: string) => void;
  onFly: (target: [number, number, number], offset: [number, number, number]) => void;
  onHoverStart: (id: string) => void;
  onHoverEnd: (id: string) => void;
  onFailure: () => void;
};

function useBehavior(
  facts: ScreenFacts | undefined,
  intensity: 0 | 1 | 2 | 3,
  secondMonitor: boolean,
) {
  const mode = workMode(facts);
  const quiet = facts?.quietMinutes ?? null;
  const known = quiet !== null;
  const longQuiet = known && quiet >= LONG_QUIET_MINUTES;
  return useMemo<BehaviorScene>(
    () => ({
      mode,
      intensity,
      secondMonitor,
      quietMinutes: known ? (longQuiet ? LONG_QUIET_MINUTES : 0) : null,
    }),
    [mode, intensity, secondMonitor, known, longQuiet],
  );
}

type Profile = ReturnType<typeof deskProfile>;

function DeskFurnishings({ p, profile }: { p: MemberProps; profile: Profile }) {
  const { agent, facts, intensity, quality, reducedMotion } = p;
  const department = departmentAt(p.desk.floor ?? 0);
  const lit = !p.light && quality !== 'low';
  return (
    <>
      <MemberScreen
        role={p.role}
        member={agent.id}
        accent={department.accent}
        activity={agent.activity}
        facts={facts}
        theme={department.id}
        intensity={intensity}
        profile={profile}
        reducedMotion={reducedMotion}
        rich={lit}
      />
      {lit && <DeskItems profile={profile} />}
      <DeskEffects intensity={intensity} seed={agent.id} />
      <ContextGauge percent={facts?.contextPercent ?? null} />
      <ScreenGlow
        accent={department.accent}
        level={intensity}
        on={lit && ACTIVE.includes(agent.activity)}
      />
      {!lit && <ContactShadow z={SEAT_DEPTH} />}
      {p.attention && (
        <AttentionRing z={SEAT_DEPTH * 0.4} animate={!reducedMotion && quality !== 'low'} />
      )}
      {p.compaction && !reducedMotion && quality !== 'low' && (
        <CompactionEffect key={p.compaction.key} position={[0, HEAD_Y, SEAT_DEPTH]} />
      )}
    </>
  );
}

type BodyProps = { p: MemberProps; animal: BodyAnimal };
type BodyAnimal = Pick<
  AnimalProps,
  'selected' | 'ring' | 'emote' | 'reducedMotion' | 'quality' | 'light' | 'onError'
>;

function LeavingBody({
  p,
  animal,
  departure,
}: BodyProps & { departure: NonNullable<MemberProps['departure']> }) {
  const { agent, apparition } = p;
  return (
    <Departing
      plan={departure.plan}
      startAt={departure.startAt}
      reducedMotion={p.reducedMotion}
      bag={apparition !== 'ghost'}
      bagColor={agent.color}
    >
      {(clip) => (
        <Animal
          agent={agent}
          {...animal}
          apparition={clip && apparition === 'sleeping_rabbit' ? undefined : apparition}
          override={clip ?? undefined}
          pace={clip === 'walk' ? WALK_PACE : 1}
        />
      )}
    </Departing>
  );
}

function SeatedBody({ p, animal, behavior }: BodyProps & { behavior: BehaviorScene }) {
  const { agent, desk } = p;
  return (
    <Poser
      seat={{ x: desk.x, z: desk.z, floor: desk.floor ?? 0, rotation: desk.rotation }}
      seed={agent.id}
      engagements={p.engagements}
      turn={p.turn}
      reducedMotion={p.reducedMotion}
    >
      <Animal
        agent={agent}
        {...animal}
        apparition={p.apparition}
        pace={1 + p.intensity * 0.4}
        behavior={behavior}
      />
    </Poser>
  );
}

function MemberBody({ p, behavior }: { p: MemberProps; behavior: BehaviorScene }) {
  const { agent, departure, reducedMotion, quality, light } = p;
  const animal = {
    selected: p.selected,
    ring: p.ring,
    emote: p.emote,
    reducedMotion,
    quality,
    light,
    onError: p.onFailure,
  };
  return (
    <>
      {departure ? (
        <LeavingBody p={p} animal={animal} departure={departure} />
      ) : (
        <SeatedBody p={p} animal={animal} behavior={behavior} />
      )}
      {p.zombie && !departure && (
        <Animal
          agent={agent}
          apparition="zombie"
          selected={false}
          reducedMotion={reducedMotion}
          quality={quality}
          light={light}
          onError={p.onFailure}
        />
      )}
    </>
  );
}

export function Member(p: MemberProps) {
  const { agent, desk } = p;
  const baseY = floorY(desk.floor ?? 0, p.exploded);
  const menu = useRef(p.onMenu);
  menu.current = p.onMenu;
  const profile = useMemo(() => deskProfile(agent.id, p.role), [agent.id, p.role]);
  const behavior = useBehavior(p.facts, p.intensity, profile.monitors === 2);
  const press = useMemo(() => createLongPress(() => menu.current(agent.id)), [agent.id]);
  return (
    <group position={[desk.x, baseY, desk.z]} rotation={[0, (desk.rotation * Math.PI) / 2, 0]}>
      <DeskFurnishings p={p} profile={profile} />
      <group
        position={[0, 0, SEAT_DEPTH]}
        {...characterEvents(agent.id, [desk.x, baseY + 0.7, desk.z], press, p)}
      >
        <MemberBody p={p} behavior={behavior} />
      </group>
    </group>
  );
}
