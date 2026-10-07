import { useCallback, useEffect, useRef, useState } from 'react';

type Hands = {
  resumeMs: number;
  selectedId: string | null;
  /** Any touch of the camera is the person's own shot: it ends a follow. */
  setFollowing: (id: string | null) => void;
  /** Ends the first-visit tour, which yields to the person. */
  interruptIntro: (() => void) | undefined;
  onUserCamera: (() => void) | undefined;
};

/**
 * Who has the camera: the person, from their last touch until `resumeMs` of quiet has passed (twice that after choosing a
 * member), or the director. While a member is chosen the camera stays with the person: it is not taken back from under
 * their reading.
 */
export function useTakeOver({
  resumeMs,
  selectedId,
  setFollowing,
  interruptIntro,
  onUserCamera,
}: Hands) {
  const [paused, setPaused] = useState(false);
  const resume = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const chosen = useRef(selectedId);
  chosen.current = selectedId;
  const takeOver = useCallback(
    (long = false) => {
      setPaused(true);
      clearTimeout(resume.current);
      resume.current = setTimeout(
        () => {
          if (!chosen.current) setPaused(false);
        },
        resumeMs * (long ? 2 : 1),
      );
    },
    [resumeMs],
  );
  useEffect(() => () => clearTimeout(resume.current), []);
  const userCamera = useCallback(() => {
    setFollowing(null); // a drag, a wheel turn or a key press ends the follow
    interruptIntro?.();
    takeOver();
    onUserCamera?.();
  }, [takeOver, onUserCamera, interruptIntro, setFollowing]);
  // A press on a name tag: the director steps back and a tour yields, but a follow is kept (nothing moved the camera).
  const pause = useCallback(() => {
    interruptIntro?.();
    takeOver();
    onUserCamera?.();
  }, [takeOver, onUserCamera, interruptIntro]);
  // Choosing a member is the person's doing too; only a change of choice counts, not the one the page starts with.
  const firstSelection = useRef(true);
  const takeOverNow = useRef(takeOver);
  takeOverNow.current = takeOver;
  useEffect(() => {
    if (firstSelection.current) {
      firstSelection.current = false;
      return;
    }
    if (selectedId) takeOverNow.current(true);
    else takeOverNow.current(); // let go of the member: the director returns after a quiet spell
  }, [selectedId]);
  return { paused, setPaused, takeOver, userCamera, pause };
}
