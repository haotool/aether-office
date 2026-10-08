import { useEffect, useRef, type ComponentRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { MathUtils, PerspectiveCamera, Vector3, type Camera } from 'three';
import { fittedOffset } from './scene-geometry.js';
import type { Seat } from './director.js';
import type { Directed } from './scene-navigation.js';
import { FLY_MS, MIN_DISTANCE, poseAt, type Pose, type V3 } from './shot-camera.js';

export type FlyTo = {
  id: number;
  target: [number, number, number];
  offset: [number, number, number];
};

const MAX_DISTANCE = 300;
const HOME_FOV = 38;

const smoothstep = (t: number) => t * t * (3 - 2 * t);
const lerp3 = (a: V3, b: V3, u: number): V3 => [
  MathUtils.lerp(a[0], b[0], u),
  MathUtils.lerp(a[1], b[1], u),
  MathUtils.lerp(a[2], b[2], u),
];
const blend = (a: Pose, b: Pose, u: number): Pose => ({
  position: lerp3(a.position, b.position, u),
  target: lerp3(a.target, b.target, u),
  fov: MathUtils.lerp(a.fov, b.fov, u),
});

type Controls = NonNullable<ComponentRef<typeof OrbitControls>>;
/** A flight in progress; `snap` is a move with no animation (reduced motion), taken as soon as the controls exist. */
type Goal = { target: Vector3; position: Vector3; snap: boolean };
type Glide = { from: Pose; startedAt: number };
/** What the frame loop keeps between frames: the flight, the shot being played and the glide that brings the camera to it. */
type Flight = { goal: Goal | null; shot: number; glide: Glide | null };

/** Sets the lens angle (only when it differs, since a projection update is not free). */
function setFov(camera: Camera, fov: number) {
  if (camera instanceof PerspectiveCamera && camera.fov !== fov) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
}

/** The first-visit tour holds the camera exactly where its path says, like a shot: nothing chases, nothing is blended. */
function holdTour(c: Controls, camera: Camera, tour: Pose) {
  camera.position.set(...tour.position);
  c.target.set(...tour.target);
  setFov(camera, tour.fov);
  c.update();
}

/** Smooth fly-to: ease the camera and what it looks at toward the destination (at once under reduced motion). */
function flyToGoal(f: Flight, c: Controls, camera: Camera, delta: number, invalidate: () => void) {
  const g = f.goal;
  if (!g) return;
  if (g.snap) {
    c.target.copy(g.target);
    camera.position.copy(g.position);
    camera.lookAt(g.target);
    c.update();
    f.goal = null;
    invalidate();
    return;
  }
  const k = 1 - Math.exp(-delta * 4.5);
  c.target.lerp(g.target, k);
  camera.position.lerp(g.position, k);
  c.update();
  invalidate();
  if (c.target.distanceTo(g.target) < 0.04 && camera.position.distanceTo(g.position) < 0.08)
    f.goal = null;
}

/**
 * Following: once a flight is over, the camera and what it looks at slide together towards the member, keeping the
 * distance and bearing the person has. The seat is still, so this only moves when the seat does (a layout change, a floor).
 */
function followMember(
  c: Controls,
  camera: Camera,
  point: V3,
  delta: number,
  invalidate: () => void,
) {
  const k = 1 - Math.exp(-delta * 3);
  const move = new Vector3(...point).sub(c.target).multiplyScalar(k);
  if (move.lengthSq() <= 1e-6) return;
  c.target.add(move);
  camera.position.add(move);
  c.update();
  invalidate();
}

/**
 * The director's shot: the camera is put exactly where the shot's move says it is at this moment, never chased
 * towards it, so a held shot holds and a move is the move and nothing else. A near shot is reached by a timed,
 * eased glide from where the camera was; a far one by a cut.
 */
function playShot(
  f: Flight,
  directed: Directed,
  seats: ReadonlyMap<string, Seat>,
  aspect: number,
  c: Controls,
  camera: Camera,
) {
  if (f.shot !== directed.startedAt) {
    f.shot = directed.startedAt;
    f.glide =
      directed.entry === 'fly'
        ? {
            from: {
              position: camera.position.toArray(),
              target: c.target.toArray(),
              fov: camera instanceof PerspectiveCamera ? camera.fov : HOME_FOV,
            },
            startedAt: directed.startedAt,
          }
        : null;
  }
  const now = Date.now();
  const pose = poseAt(
    directed.shot,
    seats,
    (now - directed.startedAt) / (directed.shot.seconds * 1000),
    aspect,
  );
  const entering = f.glide;
  const u = entering ? smoothstep(Math.min(1, (now - entering.startedAt) / FLY_MS)) : 1;
  if (entering && u >= 1) f.glide = null;
  const at = entering ? blend(entering.from, pose, u) : pose;
  camera.position.set(...at.position);
  c.target.set(...at.target);
  setFov(camera, at.fov);
  c.update();
}

type Keyboard = { forward: Vector3; side: Vector3 };

/** Keyboard flight: WASD or arrows glide over the ground, Q/E orbit, +/- dolly; Shift is faster. */
function flyByKeys(
  keys: ReadonlySet<string>,
  f: Flight,
  c: Controls,
  camera: Camera,
  { forward, side }: Keyboard,
  delta: number,
) {
  const fast = keys.has('shift') ? 2.4 : 1;
  const distance = camera.position.distanceTo(c.target);
  const step = Math.max(6, distance * 0.55) * fast * delta;
  forward.set(c.target.x - camera.position.x, 0, c.target.z - camera.position.z).normalize();
  side.set(-forward.z, 0, forward.x);
  const move = new Vector3();
  if (keys.has('w') || keys.has('arrowup')) move.addScaledVector(forward, step);
  if (keys.has('s') || keys.has('arrowdown')) move.addScaledVector(forward, -step);
  if (keys.has('d') || keys.has('arrowright')) move.addScaledVector(side, -step);
  if (keys.has('a') || keys.has('arrowleft')) move.addScaledVector(side, step);
  if (move.lengthSq()) {
    c.target.add(move);
    camera.position.add(move);
    f.goal = null;
  }
  const turn = (keys.has('q') ? 1 : 0) - (keys.has('e') ? 1 : 0);
  if (turn) {
    const offset = camera.position
      .clone()
      .sub(c.target)
      .applyAxisAngle(new Vector3(0, 1, 0), turn * 1.4 * delta);
    camera.position.copy(c.target).add(offset);
    f.goal = null;
  }
  const dolly = (keys.has('=') || keys.has('+') ? 1 : 0) - (keys.has('-') || keys.has('_') ? 1 : 0);
  if (dolly) {
    const offset = camera.position.clone().sub(c.target);
    const next = MathUtils.clamp(
      offset.length() * Math.exp(-dolly * 1.1 * delta),
      MIN_DISTANCE,
      MAX_DISTANCE,
    );
    camera.position.copy(c.target).add(offset.setLength(next));
    f.goal = null;
  }
  c.update();
}

/** A new command starts a flight to its target (at once under reduced motion); the frame loop carries it out. */
function useFlyCommand(
  flight: RefObject<Flight>,
  command: FlyTo,
  reducedMotion: boolean,
  latestAspect: RefObject<number>,
) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const target = new Vector3(...command.target);
    const position = target
      .clone()
      .add(new Vector3(...fittedOffset(command.offset, latestAspect.current)));
    // Never move the camera without its controls: they would turn it back toward where they last looked. When they
    // are not mounted yet (a project opened straight from the address) the move waits for them in useFrame.
    flight.current.goal = { target, position, snap: reducedMotion };
    invalidate();
  }, [command, camera, invalidate, reducedMotion, flight, latestAspect]);
}

/** The person's hands on the controls end a flight at once: nothing pulls the camera on from under the hand. */
function useUserTouch(
  controls: RefObject<Controls | null>,
  flight: RefObject<Flight>,
  onUserCamera: (() => void) | undefined,
) {
  useEffect(() => {
    const instance = controls.current;
    if (!instance || !onUserCamera) return;
    // 'start' fires only for user input, never for programmatic camera moves (the director gives way through `onUserCamera`).
    const touched = () => {
      flight.current.goal = null;
      onUserCamera();
    };
    instance.addEventListener('start', touched);
    return () => instance.removeEventListener('start', touched);
  }, [controls, flight, onUserCamera]);
}

type SceneCameraProps = {
  command: FlyTo;
  reducedMotion: boolean;
  onUserCamera?: (() => void) | undefined;
  keyboardRef: RefObject<Set<string>>;
  /** The shot the director is playing; null when the camera is the person's. */
  directed: Directed | null;
  seats: ReadonlyMap<string, Seat>;
  /** A member the person asked to follow: the camera keeps it in the middle (it moves with the seat, never against a hand on the controls). */
  followPoint?: V3 | null;
  /** The first-visit tour's camera: its pose this frame, or null when the tour does not hold the camera (see intro/). */
  introPose?: ((aspect: number) => Pose | null) | undefined;
};

/** Handed back to the person: the lens returns to its usual angle of view. True while it is still moving. */
function easeLensHome(camera: Camera, delta: number): boolean {
  if (!(camera instanceof PerspectiveCamera) || Math.abs(camera.fov - HOME_FOV) <= 0.05)
    return false;
  camera.fov += (HOME_FOV - camera.fov) * (1 - Math.exp(-delta * 3));
  camera.updateProjectionMatrix();
  return true;
}

/** The canvas's aspect as of the last render, read when a flight starts, not tracked: the browser's own toolbars resizing the page must not move the camera. */
function useLatestAspect() {
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const latest = useRef(aspect);
  latest.current = aspect;
  return latest;
}

export function SceneCamera({
  command,
  reducedMotion,
  onUserCamera,
  keyboardRef,
  directed,
  seats,
  followPoint,
  introPose,
}: SceneCameraProps) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const latestAspect = useLatestAspect();
  const flight = useRef<Flight>({ goal: null, shot: 0, glide: null });
  useFlyCommand(flight, command, reducedMotion, latestAspect);
  useUserTouch(controls, flight, onUserCamera);
  const followed = useRef<V3 | null>(null);
  followed.current = followPoint ?? null;
  const keyboard = useRef<Keyboard>({ forward: new Vector3(), side: new Vector3() });
  useFrame((_state, delta) => {
    const c = controls.current;
    if (!c) return;
    const f = flight.current;
    const tour = introPose?.(latestAspect.current) ?? null;
    if (tour) {
      f.goal = null;
      holdTour(c, camera, tour);
      invalidate();
      return;
    }
    const flying = f.goal !== null; // a flight that ends this frame still holds the shot back until the next
    flyToGoal(f, c, camera, delta, invalidate);
    if (followed.current && !f.goal && !reducedMotion)
      followMember(c, camera, followed.current, delta, invalidate);
    if (directed && !flying) {
      playShot(f, directed, seats, latestAspect.current, c, camera);
      invalidate();
    }
    if (!directed && easeLensHome(camera, delta)) invalidate();
    const keys = keyboardRef.current;
    if (keys && keys.size) {
      flyByKeys(keys, f, c, camera, keyboard.current, delta);
      invalidate();
    }
  });
  return <CameraControls controls={controls} damping={!reducedMotion} />;
}

/** The orbit controls: how far in and out, how far down, and how quickly each gesture moves the camera. */
function CameraControls({
  controls,
  damping,
}: {
  controls: RefObject<ComponentRef<typeof OrbitControls> | null>;
  damping: boolean;
}) {
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping={damping}
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
