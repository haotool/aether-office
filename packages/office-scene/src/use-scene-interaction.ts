import { useCallback, useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react';
import type { Agent, Layout } from '@aether/contracts';
import { emoteBlock, type EmoteId } from './emotes.js';
import type { HoverFacts } from './InteractionLayer.js';
import { wordsFor } from './interaction-text.js';
import { floorY } from './scene-geometry.js';
import type { useSceneNavigation } from './scene-navigation.js';
import { labelsOf } from './scene-markers.js';
import type { SceneBridge } from './SceneBridge.js';
import { useEmotes, type EmoteResult } from './use-emotes.js';
import type { PoseApi } from './use-pose-cues.js';
import { useAnnouncer, useCharacterMarks, useHoverCard } from './use-interaction.js';
import { useMarquee } from './use-marquee.js';
import type { SeatCheck } from './seat-drag.js';
import { useSeatDrag, type SeatMove } from './use-seat-drag.js';
import { useWallFeeds } from './use-wall-feeds.js';

/** What the page's menu may ask of the scene for one character. */
export type SceneActions = {
  followed: boolean;
  toggleFollow: () => void;
  lookAtScreen: () => void;
  pinned: boolean;
  /** The wall of small views can take this member (it is on, has room, or already shows it). */
  canPin: boolean;
  togglePin: () => void;
  /** Why this character cannot emote now, or null. */
  emoteBlocked: 'apparition' | 'leaving' | null;
  emote: (id: EmoteId) => EmoteResult | 'blocked';
};

export type CharacterMenuContext = {
  id: string;
  agent: Agent;
  /** A phone: the page shows the menu in a sheet instead of beside the character. */
  compact: boolean;
  close: () => void;
  scene: SceneActions;
};
export type GroupBarContext = {
  ids: string[];
  clear: () => void;
  pin: (on: boolean) => void;
  canPin: boolean;
};

type Params = {
  zh: boolean;
  compact: boolean;
  layout: Layout;
  nav: ReturnType<typeof useSceneNavigation>;
  /** The members drawn now (the floor on screen, or all of them when the building is spread apart). */
  sceneAgents: readonly Agent[];
  agents: readonly Agent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  hovered: string | null;
  /** The name tags by member id: the keyboard's way to a character, and where focus returns when the menu closes. */
  tags: RefObject<Map<string, HTMLElement>>;
  roleOf: ((agent: Agent) => string) | undefined;
  screens: Readonly<Record<string, { contextPercent: number | null }>> | undefined;
  doing: Readonly<Record<string, string>> | undefined;
  intensity: Readonly<Record<string, number>> | undefined;
  apparitions: Readonly<Record<string, unknown>> | undefined;
  leaving: Readonly<Record<string, number>> | undefined;
  quality: 'low' | 'balanced' | 'high';
  reducedMotion: boolean;
  canArrange: boolean;
  onMoveSeat: ((move: SeatMove) => void) | undefined;
  hasGroupBar: boolean;
  /** The pose registry the emotes ask (see use-pose-cues.ts). */
  pose: PoseApi['request'];
};

type Marks = ReturnType<typeof useCharacterMarks>;
type Wall = ReturnType<typeof useWallFeeds>;
type Emotes = ReturnType<typeof useEmotes>;
type Words = ReturnType<typeof wordsFor>;

/** Where each member's head is over its desk, for the marquee to pick by. */
function headsOf(agents: readonly Agent[], layout: Layout, exploded: boolean) {
  return new Map(
    agents.flatMap((a): [string, [number, number, number]][] => {
      const d = layout.objects.find((o) => o.agentId === a.id);
      return d ? [[a.id, [d.x, floorY(d.floor ?? 0, exploded) + 1.3, d.z]]] : [];
    }),
  );
}

/** The card over the character the pointer is on (not while a menu is open or a desk is carried). */
function hoverFactsOf(p: Params, hoverId: string | null, menuId: string | null, carrying: boolean) {
  const agent =
    hoverId && !menuId && !carrying ? p.sceneAgents.find((a) => a.id === hoverId) : undefined;
  if (!agent) return null;
  const facts: HoverFacts = {
    agent,
    role: p.roleOf?.(agent) ?? 'generalist',
    context: p.screens?.[agent.id]?.contextPercent ?? null,
    doing: p.doing?.[agent.id],
  };
  return facts;
}

/** Where DOM boxes for members go: over their desks, `lift` metres higher than their name tags. */
function anchorsFor(p: Params) {
  return (ids: readonly string[], lift = 0) =>
    labelsOf(
      p.sceneAgents.filter((a) => ids.includes(a.id)),
      p.layout,
      p.nav.floor,
      p.nav.exploded && !p.compact,
    )
      .filter((l) => ids.includes(l.id))
      .map((l) => ({ ...l, y: l.y + lift }));
}

/** What the page's menu may ask of the scene for one character, and the pins on the wall of small views. */
function characterActions(o: {
  p: Params;
  marks: Marks;
  wall: Wall;
  emotes: Emotes;
  words: Words;
  announce: (text: string) => void;
  setWallClosed: (closed: boolean) => void;
}) {
  const { p, marks, wall, emotes, words, announce } = o;
  const pinnable = (id: string) =>
    wall.capacity > 0 && (marks.pinned.has(id) || marks.pinned.size < wall.capacity);
  const pinIds = (ids: readonly string[], on: boolean) => {
    if (on) o.setWallClosed(false);
    marks.pin(ids, on);
  };
  const blocked = (id: string) =>
    emoteBlock({
      apparition: p.apparitions?.[id] as string | undefined,
      leaving: p.leaving?.[id] !== undefined,
    });
  const actionsFor = (id: string): SceneActions => ({
    followed: p.nav.following === id,
    toggleFollow: () => {
      p.nav.follow(p.nav.following === id ? null : id);
      announce(p.nav.following === id ? words.followOff : words.followOn);
    },
    lookAtScreen: () => p.nav.lookAtScreen(id),
    pinned: marks.pinned.has(id),
    canPin: pinnable(id),
    togglePin: () => pinIds([id], !marks.pinned.has(id)),
    emoteBlocked: blocked(id),
    emote: (emote) => {
      if (blocked(id)) {
        announce(words.emoteBlocked);
        return 'blocked';
      }
      const result = emotes.play(id, emote);
      announce(result === 'played' ? words.emote[emote] : words.emoteWait);
      return result;
    },
  });
  return { pinnable, pinIds, actionsFor };
}

/** The boxes the scene places each frame, by member id (an emote icon by "s" and its key): one registry for each kind. */
function useElementRegistries() {
  const cardElements = useRef(new Map<string, HTMLElement>()).current;
  const menuElements = useRef(new Map<string, HTMLElement>()).current;
  const spriteElements = useRef(new Map<string, HTMLElement>()).current;
  return { cardElements, menuElements, spriteElements };
}

/** The menu closes when the person chooses someone else; opening it chooses its character first, so only a change counts. */
function useCloseStaleMenu(selectedId: string | null, marks: ReturnType<typeof useCharacterMarks>) {
  const closeStaleMenu = useEffectEvent(() => {
    if (marks.menuId && selectedId !== marks.menuId) marks.closeMenu(false);
  });
  useEffect(() => closeStaleMenu(), [selectedId]);
}

/** Carrying a desk to another seat, and the rectangle that picks a group: both take the pointer, so orbit is off meanwhile. */
function useDragAndMarquee(
  p: Params,
  o: {
    stage: RefObject<HTMLDivElement | null>;
    bridge: RefObject<SceneBridge | null>;
    words: Words;
    announce: (text: string) => void;
    marks: ReturnType<typeof useCharacterMarks>;
  },
) {
  const seatDrag = useSeatDrag({
    layout: p.layout,
    exploded: p.nav.exploded,
    bridge: o.bridge,
    allowed: p.canArrange && !p.compact,
    onMove: p.onMoveSeat,
    onEnd: (outcome) => o.announce(dragLine(o.words, outcome)),
  });
  const marquee = useMarquee({
    container: o.stage,
    bridge: o.bridge,
    points: headsOf(p.sceneAgents, p.layout, p.nav.exploded),
    enabled: !p.compact && p.hasGroupBar,
    onSelect: o.marks.pick,
  });
  return { seatDrag, marquee };
}

/** What is said when a carried desk is dropped or the drag is given up. */
const dragLine = (words: Words, outcome: 'moved' | 'cancelled' | SeatCheck) =>
  outcome === 'moved'
    ? words.dragMoved
    : outcome === 'cancelled' || outcome.ok
      ? words.dragCancelled
      : words.dragBlocked[outcome.reason];

/** The control-room wall: the members it shows (not the ones the main shot or the person's choice is on), and whether the person closed it. */
function useWall(
  p: Params,
  pinned: ReadonlySet<string>,
  stage: Parameters<typeof useWallFeeds>[0]['stage'],
) {
  const [wallClosed, setWallClosed] = useState(false);
  const taken = new Set(p.nav.directed?.shot.subjects ?? []);
  if (p.selectedId) taken.add(p.selectedId);
  const wall = useWallFeeds({
    allowed: !p.compact && p.quality !== 'low' && !p.reducedMotion && !wallClosed,
    agents: p.agents,
    seats: p.nav.seats,
    intensity: p.intensity,
    taken,
    pinned,
    floor: p.nav.floor,
    exploded: p.nav.exploded,
    stage,
  });
  return { wall, setWallClosed };
}

/**
 * Everything the person can do to the characters directly: the hover card, the action menu, emotes, the group picked
 * with Shift or a rectangle, pins on the wall of small views, carrying a desk to another seat. The state lives here so
 * OfficeScene only draws it.
 */
export function useSceneInteraction(p: Params) {
  const words = wordsFor(p.zh);
  const { line, announce } = useAnnouncer();
  const focusTag = useCallback((id: string) => p.tags.current.get(id)?.focus(), [p.tags]);
  const marks = useCharacterMarks({
    words,
    selectedId: p.selectedId,
    onSelect: p.onSelect,
    focusTag,
    announce,
  });
  const stage = useRef<HTMLDivElement | null>(null);
  const { cardElements, menuElements, spriteElements } = useElementRegistries();
  const { wall, setWallClosed } = useWall(p, marks.pinned, stage);
  const bridge = useRef<SceneBridge | null>(null);
  const emotes = useEmotes(p.pose);
  const hoverId = useHoverCard(p.hovered);
  const { seatDrag, marquee } = useDragAndMarquee(p, { stage, bridge, words, announce, marks });
  useCloseStaleMenu(p.selectedId, marks);

  const actions = characterActions({ p, marks, wall, emotes, words, announce, setWallClosed });
  const anchorsOf = anchorsFor(p);
  const spriteAnchors = emotes.sprites.flatMap((sprite) =>
    anchorsOf([sprite.id], 0.2).map((a) => ({ ...a, id: `s${sprite.key}` })),
  );
  return {
    words,
    line,
    marks,
    wall,
    closeWall: () => setWallClosed(true),
    stage,
    bridge,
    emotes,
    seatDrag,
    marquee,
    hover: hoverFactsOf(p, hoverId, marks.menuId, !!seatDrag.drag),
    menuAgent: marks.menuId ? p.sceneAgents.find((a) => a.id === marks.menuId) : undefined,
    ...actions,
    anchorsOf,
    spriteAnchors,
    cardElements,
    menuElements,
    spriteElements,
  };
}
export type SceneInteraction = ReturnType<typeof useSceneInteraction>;
