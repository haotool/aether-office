import { useCallback, useEffect, useRef, useState } from 'react';

type Hands = {
  resumeMs: number;
  selectedId: string | null;
  setFollowing: (id: string | null) => void;
  onUserCamera: (() => void) | undefined;
};

export function useTakeOver({ resumeMs, selectedId, setFollowing, onUserCamera }: Hands) {
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
  const pause = useCallback(() => {
    takeOver();
    onUserCamera?.();
  }, [takeOver, onUserCamera]);
  const userCamera = useCallback(() => {
    setFollowing(null);
    pause();
  }, [pause, setFollowing]);
  const firstSelection = useRef(true);
  const takeOverNow = useRef(takeOver);
  takeOverNow.current = takeOver;
  useEffect(() => {
    if (firstSelection.current) {
      firstSelection.current = false;
      return;
    }
    if (selectedId) takeOverNow.current(true);
    else takeOverNow.current();
  }, [selectedId]);
  return { paused, setPaused, takeOver, userCamera, pause };
}
