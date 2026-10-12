import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  frameTargetMs,
  shadowDue,
  startRatio,
  stepRatio,
  type RatioState,
} from '../perf/perf-control.js';

/**
 * Redraws the shadow map at a fixed rate instead of with every render: it does not depend on the camera and what casts
 * into it moves slowly.
 */
export function ShadowThrottle({ intervalMs }: { intervalMs: number }) {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const last = useRef<number | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    return () => {
      window.clearTimeout(timer.current);
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl]);
  useFrame(() => {
    const now = performance.now();
    if (shadowDue(now, last.current, intervalMs)) {
      gl.shadowMap.needsUpdate = true;
      last.current = now;
      window.clearTimeout(timer.current);
      timer.current = undefined;
    } else if (timer.current === undefined) {
      // Only if no frame follows on its own (an idle scene): one more render once the map is due.
      timer.current = window.setTimeout(
        () => {
          timer.current = undefined;
          invalidate();
        },
        intervalMs - (now - (last.current ?? now)) + 8,
      );
    }
  }, -100);
  return null;
}

const IDLE_MS = 250;

export function AdaptiveRatio({
  ceiling: tier,
  smooth,
  compact,
}: {
  ceiling: number;
  smooth: boolean;
  compact: boolean;
}) {
  const ceiling = Math.min(tier, window.devicePixelRatio || 1); // never above the screen's own pixels
  const setDpr = useThree((s) => s.setDpr);
  const state = useRef<RatioState | null>(null);
  useEffect(() => {
    state.current = null;
  }, [ceiling]);
  useFrame((three, delta) => {
    const ms = delta * 1000;
    if (document.hidden || ms > IDLE_MS || ms <= 0) return;
    const now = performance.now();
    state.current ??= startRatio(three.viewport.dpr, now);
    const before = state.current.ratio;
    state.current = stepRatio(state.current, ms, now, frameTargetMs(smooth, compact), ceiling);
    if (state.current.ratio !== before) setDpr(state.current.ratio);
  });
  return null;
}

const WARMUP_LIMIT_MS = 4000;

export function Warmup({ onReady }: { onReady: () => void }) {
  const { gl, scene, camera, invalidate } = useThree();
  useEffect(() => {
    let live = true;
    const done = () => {
      if (!live) return;
      live = false;
      onReady();
      window.setTimeout(invalidate, 0);
    };
    const limit = window.setTimeout(done, WARMUP_LIMIT_MS);
    gl.compileAsync(scene, camera).then(done, done);
    return () => {
      live = false;
      window.clearTimeout(limit);
    };
  }, [gl, scene, camera, invalidate, onReady]);
  return null;
}
