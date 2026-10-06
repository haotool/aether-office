import { useEffect, useRef, type CSSProperties, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import type { Rect } from './multi-view.js';
import { SpeechLines } from './speech-text.js';
import { useOverflowing, useTeleprompter, useTypedLines } from './use-speech.js';

export type Utterance = { text: string; at: number | null };
/** The last prompt a member was given and the last thing it answered. */
export type SceneSpeech = { user: Utterance | null; assistant: Utterance | null };

const FADE_MS = 2 * 60_000; // a bubble this old is dimmed
const LIFT_PX = 22; // above the name tag
const EDGE_PX = 6; // the closest a bubble comes to the top of the view

function Bubble({
  role,
  tag,
  utterance,
  animate,
  now,
}: {
  role: 'user' | 'assistant';
  tag: string;
  utterance: Utterance;
  animate: boolean;
  now: number;
}) {
  const { lines, typing } = useTypedLines(utterance.text, animate && role === 'assistant');
  const box = useRef<HTMLDivElement>(null);
  const held = useRef(false);
  const overflowing = useOverflowing(box, lines);
  // Text that is still arriving keeps its end in view; once it is whole, a taller text scrolls by itself.
  useEffect(() => {
    if (typing && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [lines, typing]);
  useTeleprompter(box, animate && overflowing && !typing, held, utterance.text);
  const old = utterance.at !== null && now - utterance.at > FADE_MS;
  return (
    <div
      className={`speech-bubble ${role} ${old ? 'old' : ''} ${typing ? 'typing' : ''}`}
      role="group"
      aria-label={tag}
      data-overflow={overflowing || undefined}
      onPointerEnter={() => (held.current = true)}
      onPointerLeave={() => (held.current = false)}
    >
      <div className="speech-scroll" ref={box}>
        <SpeechLines lines={lines} caret={typing} />
      </div>
    </div>
  );
}

/**
 * Two compact bubbles over a member's head, positioned each frame by ProjectedSpeech. The text is rendered, not shown raw
 * (bold, code, bullets); a taller one scrolls by itself, and hovering a bubble holds it and lets the person read all of it.
 */
export function SpeechLayer({
  items,
  elements,
  animate,
  tags,
}: {
  items: { id: string; speech: SceneSpeech; accent: string }[];
  elements: Map<string, HTMLElement>;
  animate: boolean;
  tags: { user: string; assistant: string };
}) {
  const now = Date.now();
  return (
    <div className="world-speech">
      {items.map(({ id, speech, accent }) => (
        <div
          key={id}
          className="speech"
          style={{ ['--accent' as string]: accent } as CSSProperties}
          ref={(node) => {
            if (node) elements.set(id, node);
            else elements.delete(id);
          }}
        >
          {speech.user && (
            <Bubble
              role="user"
              tag={tags.user}
              utterance={speech.user}
              animate={animate}
              now={now}
            />
          )}
          {speech.assistant && (
            <Bubble
              role="assistant"
              tag={tags.assistant}
              utterance={speech.assistant}
              animate={animate}
              now={now}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export function ProjectedSpeech({
  anchors,
  elements,
  drawn,
}: {
  anchors: { id: string; x: number; y: number; z: number }[];
  elements: Map<string, HTMLElement>;
  /** Filled each frame with the bubbles that are shown, for the name tags to keep clear of. */
  drawn: RefObject<Map<string, Rect>>;
}) {
  const point = useRef(new Vector3());
  useFrame(({ camera, size }) => {
    const taken: { left: number; right: number; top: number; bottom: number }[] = [];
    drawn.current.clear();
    for (const a of anchors) {
      const element = elements.get(a.id);
      if (!element) continue;
      point.current.set(a.x, a.y, a.z).project(camera);
      const x = ((point.current.x + 1) * size.width) / 2;
      // Close up, a member's head is near the top of the view: the bubble slides down to stay whole rather than vanish.
      const head = ((1 - point.current.y) * size.height) / 2;
      const y =
        head > 0 ? Math.max(head - LIFT_PX, element.offsetHeight + EDGE_PX) : head - LIFT_PX;
      const box = {
        left: x - element.offsetWidth / 2,
        right: x + element.offsetWidth / 2,
        top: y - element.offsetHeight,
        bottom: y,
      };
      // In priority order: a pair that would cover one already shown stays hidden until the camera is closer.
      const visible =
        point.current.z >= -1 &&
        point.current.z <= 1 &&
        box.left > 0 &&
        box.right < size.width &&
        box.top > 0 &&
        !taken.some(
          (t) =>
            box.left < t.right && box.right > t.left && box.top < t.bottom && box.bottom > t.top,
        );
      element.style.visibility = visible ? 'visible' : 'hidden';
      element.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`;
      if (visible) {
        taken.push(box);
        drawn.current.set(a.id, {
          x: box.left,
          y: box.top,
          width: box.right - box.left,
          height: box.bottom - box.top,
        });
      }
    }
  });
  return null;
}
