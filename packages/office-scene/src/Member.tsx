import type { Agent, Layout } from '@aether/contracts';
import { useMemo, useRef } from 'react';
import { Animal, type AnimalProps, type EmoteCue, type Ring } from './Animal.js';
import { createLongPress } from './long-press.js';
import { characterEvents } from './character-events.js';
import type { Apparition } from './animal-states.js';
import { CompactionEffect } from './CompactionEffect.js';
import { ContextGauge } from './ContextGauge.js';
import { DeskEffects } from './DeskEffects.js';
import { Departing } from './Departing.js';
import { SEAT_DEPTH, WALK_PACE, type Departure } from './departure.js';
import { MemberScreen } from './MemberScreen.js';
import { DeskItems } from './DeskItems.js';
import { deskProfile } from './desk-profile.js';
import { LONG_QUIET_MINUTES, workMode } from './behavior.js';
import type { BehaviorScene } from './use-micro-actions.js';
import { AttentionRing, ContactShadow, ScreenGlow } from './DeskGlow.js';
import { Poser } from './Poser.js';
import type { Engagement } from './interplay.js';
import type { TurnCue } from './use-pose-cues.js';
import type { ScreenFacts } from './screen-facts.js';
import { ACTIVE, departmentAt, floorY } from './scene-geometry.js';
import type { SceneCompaction } from './context.js';
import type { Quality } from './scene-types.js';

/** Where the compaction effect plays: above a seated member's head, in the desk's frame. */
const HEAD_Y = 1.75;

type Desk = Layout['objects'][number];

/** One member at a desk, as the scene tells it. */
type MemberProps = {
  agent: Agent;
  desk: Desk;
  exploded: boolean;
  role: string;
  facts: ScreenFacts | undefined;
  intensity: 0 | 1 | 2 | 3;
  /** A compaction happening now: the paper-to-cube effect over the head (not when motion is reduced or quality is low). */
  compaction: SceneCompaction | undefined;
  apparition: Apparition | undefined;
  zombie: boolean;
  /** Sent home: the way out and when it begins. The member packs up, walks out and the desk is left empty. */
  departure: { plan: Departure; startAt: number } | undefined;
  /** Who this member is turned toward right now (a message in the air), newest first. */
  engagements: readonly Engagement[] | undefined;
  /** The member wants a person: a ring of light pulses on the floor round its desk. */
  attention: boolean;
  selected: boolean;
  /** The ring under the member: chosen, hovered or in the group selection. */
  ring: Ring | null;
  /** A reaction the person asked for (see emotes.ts). */
  emote: EmoteCue | undefined;
  /** A turn of the chair a life effect asked for (see pose-cues.ts). */
  turn?: TurnCue | undefined;
  reducedMotion: boolean;
  quality: Quality;
  light: boolean;
  /** A click or tap (a second one on the chosen member opens its menu; with Shift it joins the group). */
  onActivate: (id: string, shift: boolean) => void;
  /** Right click, or a finger held down on the member. */
  onMenu: (id: string) => void;
  /** A press with Alt held: the start of dragging the member's desk to another seat; false when dragging is not allowed. */
  onGrab: (id: string, event: PointerEvent) => boolean;
  onSelect: (id: string) => void;
  onFly: (target: [number, number, number], offset: [number, number, number]) => void;
  onHoverStart: (id: string) => void;
  onHoverEnd: (id: string) => void;
  onFailure: () => void;
};

/** What the micro-action director needs; only whether it has been quiet a long while matters, so its timer is not reset every minute. */
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

/** The screen and what stands and glows around the desk, in the desk's frame. */
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

/** Walking out with its bag (or a ghost's own way of going), then gone. */
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
          // A sleeping rabbit wakes as the member it is; a ghost has only its own way of going.
          apparition={clip && apparition === 'sleeping_rabbit' ? undefined : apparition}
          override={clip ?? undefined}
          pace={clip === 'walk' ? WALK_PACE : 1}
        />
      )}
    </Departing>
  );
}

/** Seated at the desk, turning toward whoever it talks to. */
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

/** The character at its desk: leaving with its bag, or seated and turning toward whoever it talks to; a jiangshi behind the chair when zombies are under it. */
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

/** One member at a desk: its screen, its character (and a jiangshi behind the chair when zombies are under it). */
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
