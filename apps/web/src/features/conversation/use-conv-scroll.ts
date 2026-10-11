import { useLayoutEffect, useRef, useState } from 'react';
import { anchorOf, newMessagesSince, type Entry } from '../conversation/turn-groups.js';

const NEAR_BOTTOM_PX = 48;

export function useConvScroll(entries: readonly Entry[] | undefined, still: boolean) {
  const scroller = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);
  const following = useRef(true);
  const anchor = useRef<string | null>(null);
  const jumping = useRef(false);
  const [unseen, setUnseen] = useState(0);
  const [away, setAway] = useState(false);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !entries) return;
    if (following.current) {
      const glide = loaded.current && !still;
      jumping.current = glide && el.scrollHeight - el.scrollTop - el.clientHeight > NEAR_BOTTOM_PX;
      el.scrollTo({ top: el.scrollHeight, behavior: glide ? 'smooth' : 'auto' });
      anchor.current = anchorOf(entries);
      setUnseen(0);
    } else setUnseen(newMessagesSince(entries, anchor.current));
    loaded.current = true;
  }, [entries, still]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (jumping.current && fromBottom >= NEAR_BOTTOM_PX) return;
    jumping.current = false;
    following.current = fromBottom < NEAR_BOTTOM_PX;
    setAway(fromBottom > el.clientHeight);
    if (following.current && entries) {
      anchor.current = anchorOf(entries);
      setUnseen(0);
    }
  };
  const toBottom = () => {
    const el = scroller.current;
    if (!el) return;
    following.current = true;
    jumping.current = !still;
    anchor.current = entries ? anchorOf(entries) : null;
    setUnseen(0);
    setAway(false);
    el.scrollTo({ top: el.scrollHeight, behavior: still ? 'auto' : 'smooth' });
  };
  const stopGliding = () => (jumping.current = false);
  return { scroller, onScroll, toBottom, stopGliding, unseen, away };
}
