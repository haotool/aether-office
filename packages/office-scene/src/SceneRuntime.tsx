import { Component, useEffect, useRef, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { AMBIENT_FRAME_MS, AMBIENT_FRAME_MS_PHONE } from './perf-control.js';

export function Runtime({
  onLost,
  onRestored,
}: {
  onLost: () => void;
  onRestored?: (() => void) | undefined;
}) {
  const { gl, invalidate } = useThree();
  useEffect(() => {
    const lost = (event: Event) => {
      event.preventDefault(); // without it the browser never offers the context back
      onLost();
    };
    const restored = () => {
      invalidate();
      onRestored?.();
    };
    const visible = () => {
      if (!document.hidden) invalidate();
    };
    gl.domElement.addEventListener('webglcontextlost', lost);
    gl.domElement.addEventListener('webglcontextrestored', restored);
    document.addEventListener('visibilitychange', visible);
    return () => {
      gl.domElement.removeEventListener('webglcontextlost', lost);
      gl.domElement.removeEventListener('webglcontextrestored', restored);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [gl, invalidate, onLost, onRestored]);
  return null;
}

// Ambient motion (drones, scan sweeps, hologram shimmer) needs no more than ~30 frames a second; the camera
// (fly-to, follow, orbit) invalidates on its own and keeps the full rate. Measured on an M4: halves GPU and renderer work.

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
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch() {
    this.props.onFailure();
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}
