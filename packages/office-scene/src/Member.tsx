import type { Agent, Layout } from '@aether/contracts';
import { DEPARTMENTS } from '@aether/kernel';
import { useMemo, useRef } from 'react';
import { Animal, type EmoteCue, type Ring } from './Animal.js';
import { createLongPress } from './long-press.js';
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
import type { ScreenFacts } from './screen-facts.js';
import { ACTIVE, AGENT_OFFSET, floorY } from './scene-geometry.js';
import type { SceneCompaction } from './context.js';
import type { Quality } from './scene-types.js';

/** Where the compaction effect plays: above a seated member's head, in the desk's frame. */
const HEAD_Y = 1.75;

type Desk = Layout['objects'][number];

/** One member at a desk: its screen, its character (and a jiangshi behind the chair when zombies are under it). */
export function Member({
  agent,
  desk,
  exploded,
  role,
  facts,
  intensity,
  compaction,
  apparition,
  zombie,
  departure,
  engagements,
  attention,
  selected,
  ring,
  emote,
  reducedMotion,
  quality,
  light,
  onActivate,
  onMenu,
  onGrab,
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
}) {
  const baseY = floorY(desk.floor ?? 0, exploded);
  const menu = useRef(onMenu);
  menu.current = onMenu;
  const profile = useMemo(() => deskProfile(agent.id, role), [agent.id, role]);
  const mode = workMode(facts);
  const quiet = facts?.quietMinutes ?? null;
  const longQuiet = quiet !== null && quiet >= LONG_QUIET_MINUTES;
  const behavior = useMemo<BehaviorScene>(
    () => ({
      mode,
      intensity,
      secondMonitor: profile.monitors === 2,
      // Only whether it has been quiet a long while matters, so the director's timer is not reset every minute.
      quietMinutes: quiet === null ? null : longQuiet ? LONG_QUIET_MINUTES : 0,
    }),
    [mode, intensity, profile.monitors, quiet === null, longQuiet], // eslint-disable-line react-hooks/exhaustive-deps -- quiet is only read as null or not
  );
  const press = useMemo(() => createLongPress(() => menu.current(agent.id)), [agent.id]);
  const animal = {
    agent,
    selected,
    ring,
    emote,
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
        profile={profile}
        reducedMotion={reducedMotion}
        rich={!light && quality !== 'low'}
      />
      {!light && quality !== 'low' && <DeskItems profile={profile} />}
      <DeskEffects intensity={intensity} seed={agent.id} />
      <ContextGauge percent={facts?.contextPercent ?? null} />
      <ScreenGlow
        accent={DEPARTMENTS[desk.floor ?? 0]?.accent ?? '#43e6df'}
        level={intensity}
        on={!light && quality !== 'low' && ACTIVE.includes(agent.activity)}
      />
      {(light || quality === 'low') && <ContactShadow z={SEAT_DEPTH} />}
      {attention && (
        <AttentionRing z={SEAT_DEPTH * 0.4} animate={!reducedMotion && quality !== 'low'} />
      )}
      {compaction && !reducedMotion && quality !== 'low' && (
        <CompactionEffect key={compaction.key} position={[0, HEAD_Y, SEAT_DEPTH]} />
      )}
      <group
        position={[0, 0, SEAT_DEPTH]}
        onClick={(e) => {
          e.stopPropagation();
          // A click that ends an orbit drag, or the end of a press-and-hold, is not a choice.
          if (e.delta > 4 || press.consumeClick()) return;
          onActivate(agent.id, e.shiftKey);
        }}
        onContextMenu={(e) => {
          e.stopPropagation();
          e.nativeEvent.preventDefault();
          onMenu(agent.id);
        }}
        onPointerDown={(e) => {
          if (e.pointerType === 'touch') press.start(e.clientX, e.clientY);
          else if (e.altKey && e.button === 0 && onGrab(agent.id, e.nativeEvent))
            e.stopPropagation();
        }}
        onPointerMove={(e) => press.move(e.clientX, e.clientY)}
        onPointerUp={press.end}
        onPointerCancel={press.end}
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
          <Poser
            seat={{ x: desk.x, z: desk.z, floor: desk.floor ?? 0, rotation: desk.rotation }}
            seed={agent.id}
            engagements={engagements}
            reducedMotion={reducedMotion}
          >
            <Animal
              {...animal}
              apparition={apparition}
              pace={1 + intensity * 0.4}
              behavior={behavior}
            />
          </Poser>
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
