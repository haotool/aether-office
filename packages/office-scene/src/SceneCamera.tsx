import { useEffect, useRef, type ComponentRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { fittedOffset } from './scene-geometry.js';
import type { Seat, Shot } from './director.js';
import { poseAt } from './shot-camera.js';

export type FlyTo = {
  id: number;
  target: [number, number, number];
  offset: [number, number, number];
};

const MIN_DISTANCE = 4;
const MAX_DISTANCE = 300;

export function SceneCamera({
  command,
  reducedMotion,
  onUserCamera,
  keyboardRef,
  directed,
  seats,
}: {
  command: FlyTo;
  reducedMotion: boolean;
  onUserCamera?: (() => void) | undefined;
  keyboardRef: RefObject<Set<string>>;
  /** The shot the director is playing, with the time it began; null when the camera is the person's. */
  directed: { shot: Shot; startedAt: number } | null;
  seats: ReadonlyMap<string, Seat>;
}) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  // Read when a flight starts, not tracked: the browser's own toolbars resizing the page must not move the camera.
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const latestAspect = useRef(aspect);
  latestAspect.current = aspect;
  // A flight in progress; `snap` is a move with no animation (reduced motion), taken as soon as the controls exist.
  const goal = useRef<{ target: Vector3; position: Vector3; snap: boolean } | null>(null);
  useEffect(() => {
    const target = new Vector3(...command.target);
    const position = target
      .clone()
      .add(new Vector3(...fittedOffset(command.offset, latestAspect.current)));
    // Never move the camera without its controls: they would turn it back toward where they last looked. When they
    // are not mounted yet (a project opened straight from the address) the move waits for them in useFrame.
    goal.current = { target, position, snap: reducedMotion };
    invalidate();
  }, [command, camera, invalidate, reducedMotion]);
  useEffect(() => {
    const instance = controls.current;
    if (!instance || !onUserCamera) return;
    // 'start' fires only for user input, never for programmatic camera moves.
    instance.addEventListener('start', onUserCamera);
    return () => instance.removeEventListener('start', onUserCamera);
  }, [onUserCamera]);
  const forward = useRef(new Vector3());
  const side = useRef(new Vector3());
  useFrame((_state, delta) => {
    const c = controls.current;
    if (!c) return;
    // Smooth fly-to: ease the camera and what it looks at toward the destination.
    const g = goal.current;
    if (g?.snap) {
      c.target.copy(g.target);
      camera.position.copy(g.position);
      camera.lookAt(g.target);
      c.update();
      goal.current = null;
      invalidate();
    } else if (g) {
      const k = 1 - Math.exp(-delta * 4.5);
      c.target.lerp(g.target, k);
      camera.position.lerp(g.position, k);
      c.update();
      invalidate();
      if (c.target.distanceTo(g.target) < 0.04 && camera.position.distanceTo(g.position) < 0.08)
        goal.current = null;
    }
    // The director's shot: the pose it asks for, approached smoothly so a cut becomes a glide and a move never jolts.
    if (directed && !g) {
      const t = (Date.now() - directed.startedAt) / (directed.shot.seconds * 1000);
      const pose = poseAt(directed.shot, seats, t, latestAspect.current);
      const move = 1 - Math.exp(-delta * 2.4);
      const look = 1 - Math.exp(-delta * 3.2);
      c.target.lerp(new Vector3(...pose.target), look);
      camera.position.lerp(new Vector3(...pose.position), move);
      if (camera instanceof PerspectiveCamera && Math.abs(camera.fov - pose.fov) > 0.02) {
        camera.fov += (pose.fov - camera.fov) * (1 - Math.exp(-delta * 2));
        camera.updateProjectionMatrix();
      }
      c.update();
      invalidate();
    }
    // Handed back to the person: the lens returns to its usual angle of view.
    if (!directed && camera instanceof PerspectiveCamera && Math.abs(camera.fov - 38) > 0.05) {
      camera.fov += (38 - camera.fov) * (1 - Math.exp(-delta * 3));
      camera.updateProjectionMatrix();
      invalidate();
    }
    // Keyboard flight: WASD or arrows glide over the ground, Q/E orbit, +/- dolly; Shift is faster.
    const keys = keyboardRef.current;
    if (keys && keys.size) {
      const fast = keys.has('shift') ? 2.4 : 1;
      const distance = camera.position.distanceTo(c.target);
      const step = Math.max(6, distance * 0.55) * fast * delta;
      forward.current
        .set(c.target.x - camera.position.x, 0, c.target.z - camera.position.z)
        .normalize();
      side.current.set(-forward.current.z, 0, forward.current.x);
      const move = new Vector3();
      if (keys.has('w') || keys.has('arrowup')) move.addScaledVector(forward.current, step);
      if (keys.has('s') || keys.has('arrowdown')) move.addScaledVector(forward.current, -step);
      if (keys.has('d') || keys.has('arrowright')) move.addScaledVector(side.current, -step);
      if (keys.has('a') || keys.has('arrowleft')) move.addScaledVector(side.current, step);
      if (move.lengthSq()) {
        c.target.add(move);
        camera.position.add(move);
        goal.current = null;
      }
      const turn = (keys.has('q') ? 1 : 0) - (keys.has('e') ? 1 : 0);
      if (turn) {
        const offset = camera.position
          .clone()
          .sub(c.target)
          .applyAxisAngle(new Vector3(0, 1, 0), turn * 1.4 * delta);
        camera.position.copy(c.target).add(offset);
        goal.current = null;
      }
      const dolly =
        (keys.has('=') || keys.has('+') ? 1 : 0) - (keys.has('-') || keys.has('_') ? 1 : 0);
      if (dolly) {
        const offset = camera.position.clone().sub(c.target);
        const next = MathUtils.clamp(
          offset.length() * Math.exp(-dolly * 1.1 * delta),
          MIN_DISTANCE,
          MAX_DISTANCE,
        );
        camera.position.copy(c.target).add(offset.setLength(next));
        goal.current = null;
      }
      c.update();
      invalidate();
    }
  });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping={!reducedMotion}
      dampingFactor={0.07}
      minDistance={MIN_DISTANCE}
      maxDistance={MAX_DISTANCE}
      maxPolarAngle={Math.PI / 2.02}
      minPolarAngle={0.08}
      zoomSpeed={1.15}
      rotateSpeed={0.7}
      panSpeed={0.9}
      zoomToCursor
    />
  );
}
