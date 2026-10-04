import { Component, useEffect, useRef, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';

export function Runtime({ onFailure }: { onFailure: () => void }) {
  const { gl, invalidate } = useThree();
  useEffect(() => {
    const lost = (event: Event) => {
      event.preventDefault();
      onFailure();
    };
    const visible = () => {
      if (!document.hidden) invalidate();
    };
    gl.domElement.addEventListener('webglcontextlost', lost);
    document.addEventListener('visibilitychange', visible);
    return () => {
      gl.domElement.removeEventListener('webglcontextlost', lost);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [gl, invalidate, onFailure]);
  return null;
}

// Ambient motion (drones, scan sweeps, hologram shimmer) needs no more than ~30 frames a second; the camera
// (fly-to, follow, orbit) invalidates on its own and keeps the full rate. Measured on an M4: halves GPU and renderer work.
const AMBIENT_FRAME_MS = 24;
/** On a phone the ambient scene settles at about 20 frames a second: the battery, not the eye, is the limit. */
const AMBIENT_FRAME_MS_PHONE = 50;

export function AnimationClock({
  active,
  smooth,
  slow = false,
}: {
  active: boolean;
  smooth: boolean;
  slow?: boolean;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const timer = useRef<number | undefined>(undefined);
  useFrame(() => {
    if (!active || document.hidden) return;
    if (smooth) invalidate();
    else if (timer.current === undefined)
      timer.current = window.setTimeout(
        () => {
          timer.current = undefined;
          invalidate();
        },
        slow ? AMBIENT_FRAME_MS_PHONE : AMBIENT_FRAME_MS,
      );
  });
  useEffect(() => {
    if (active) invalidate();
    return () => window.clearTimeout(timer.current);
  }, [active, invalidate]);
  return null;
}

export class SceneBoundary extends Component<
  { children: ReactNode; onFailure: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFailure();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
