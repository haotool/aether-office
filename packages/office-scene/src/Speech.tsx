import { useEffect, useRef, useState, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import type { Rect } from './multi-view.js';

export type Utterance = { text: string; at: number | null };
/** The last prompt a member was given and the last thing it answered. */
export type SceneSpeech = { user: Utterance | null; assistant: Utterance | null };

const FADE_MS = 2 * 60_000; // a bubble this old is dimmed
const TYPE_MS = 1200; // a new reply types out in about this long, however long it is
const TYPE_TICK_MS = 30;
const LIFT_PX = 22; // above the name tag

/** The characters of `text` shown so far: a text that changes after the first look is typed out, unless motion is reduced. */
function useTyped(text: string, animate: boolean) {
  const chars = Array.from(text);
  const [shown, setShown] = useState(chars.length);
  const previous = useRef(text);
  useEffect(() => {
    if (previous.current === text) return;
    previous.current = text;
    const total = Array.from(text).length;
    if (!animate) {
      setShown(total);
      return;
    }
    const step = Math.max(1, Math.ceil(total / (TYPE_MS / TYPE_TICK_MS)));
    setShown(0);
    const timer = setInterval(
      () =>
        setShown((n) => {
          if (n + step < total) return n + step;
          clearInterval(timer);
          return total;
        }),
      TYPE_TICK_MS,
    );
    return () => clearInterval(timer);
  }, [text, animate]);
  return chars.slice(0, shown).join('');
}

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
  const text = useTyped(utterance.text, animate && role === 'assistant');
  const old = utterance.at !== null && now - utterance.at > FADE_MS;
  return (
    <p className={`speech-bubble ${role} ${old ? 'old' : ''}`} aria-label={tag}>
      <span>{text}</span>
    </p>
  );
}

/** Two compact bubbles over a member's head, positioned each frame by ProjectedSpeech. Hovering one shows all of it. */
export function SpeechLayer({
  items,
  elements,
  animate,
  tags,
}: {
  items: { id: string; speech: SceneSpeech }[];
  elements: Map<string, HTMLElement>;
  animate: boolean;
  tags: { user: string; assistant: string };
}) {
  const now = Date.now();
  return (
    <div className="world-speech">
      {items.map(({ id, speech }) => (
        <div
          key={id}
          className="speech"
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
      const y = ((1 - point.current.y) * size.height) / 2 - LIFT_PX;
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
