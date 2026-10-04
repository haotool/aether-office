import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  Component,
  type ReactNode,
  type ComponentRef,
  type RefObject,
} from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import {
  AdditiveBlending,
  MathUtils,
  QuadraticBezierCurve3,
  TubeGeometry,
  Vector3,
  type Mesh,
} from 'three';
import type { Agent, Layout } from '@aether/contracts';
import { DEPARTMENTS } from '@aether/kernel';
import {
  EXPLODED_GAP,
  FLOOR_HEIGHT,
  buildFloor,
  disposeFloor,
  type FloorModel,
} from './building.js';
import { FLOORS, defaultLayout, floorZones, zones } from './layout.js';
import { OrbitalBackdrop } from './OrbitalBackdrop.js';
import { Animal } from './Animal.js';
import type { Apparition } from './animal-states.js';
import { MessageCarriers } from './MessageCarriers.js';
import { PerfProbe } from './PerfProbe.js';
import { SCREEN_H, SCREEN_W, screenTexture } from './screens.js';
import type { PerfReport } from './perf.js';
import type { SceneMessage } from './carriers.js';

export type Quality = 'low' | 'balanced' | 'high';
export type BranchInfo = {
  branch: string | null;
  linked: boolean;
  dirty: number;
  ahead: number;
  behind: number;
};
export type OfficeSceneProps = {
  agents: Agent[];
  layout: Layout | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  quality: Quality;
  reducedMotion: boolean;
  locale: 'zh-TW' | 'en';
  focus: string;
  onFailure: () => void;
  messages?: readonly SceneMessage[];
  onMessageUnreachable?: (messageId: string, recipientId: string) => void;
  /** Fired when the user drags, zooms or pans the camera, so automation like a tour can yield. */
  onUserCamera?: () => void;
  /** Which engineering role an agent works in; picks the art on its screen. */
  roleOf?: (agent: Agent) => string;
  /** The Git branch an agent works on, drawn as a beam from its desk into the core (the default branch). */
  branchOf?: (agent: Agent) => BranchInfo | null;
  /** Members drawn as something else at their own seat: a sleeping rabbit, a ghost, a jiangshi (see animal-states). */
  apparitions?: Readonly<Record<string, Apparition>>;
  /** Members with zombie processes under them (id → how many): a jiangshi stands behind each one's chair as well. */
  zombies?: Readonly<Record<string, number>>;
  /** Agents with something new for the user (waiting for them, or finished): their labels are marked. */
  unreadIds?: ReadonlySet<string>;
  /** When set, the scene renders continuously for a fixed sample and reports measured frame times. */
  onPerfReport?: (report: PerfReport) => void;
};

const floorOfDesk = (layout: Layout, agentId: string) =>
  layout.objects.find((o) => o.agentId === agentId)?.floor ?? 0;

/** World height of a floor: stacked tightly, or spread apart in the exploded view. */
export const floorY = (floor: number, exploded: boolean) =>
  floor * (FLOOR_HEIGHT + (exploded ? EXPLODED_GAP : 0));
/** Where the camera looks for a floor, or for the whole building when it is spread apart. */
const lookY = (floor: number, exploded: boolean) =>
  exploded ? floorY((FLOORS - 1) / 2, true) : floorY(floor, false);
// Camera offsets from what it looks at: the whole building or one floor, a desk, a room.
const OVERVIEW = (exploded: boolean): [number, number, number] =>
  exploded ? [62, 44, 82] : [30, 34, 44];
const AGENT_OFFSET: [number, number, number] = [3.4, 3.0, 4.6];
const FOLLOW_OFFSET: [number, number, number] = [2.4, 2.1, 3.4];
const ZONE_OFFSET: [number, number, number] = [14, 12, 17];

const Floor = memo(function Floor({
  layout,
  floor,
  y,
  animate,
  detail,
}: {
  layout: Layout;
  floor: number;
  y: number;
  animate: boolean;
  detail: boolean;
}) {
  const model = useMemo<FloorModel>(() => buildFloor(layout, floor), [layout, floor]);
  useEffect(() => () => disposeFloor(model), [model]);
  // Moving parts (hologram rings, breathing trim) advance only while the scene animates, at a steady rate.
  const clock = useRef(0);
  useFrame((_state, delta) => {
    if (!animate || document.hidden) return;
    clock.current += delta;
    for (const s of model.spinners) s.mesh.rotation[s.axis] += s.speed * delta;
    for (const h of model.holograms) h.uniforms['time']!.value = clock.current;
    for (const o of model.orbiters) {
      const t = clock.current * o.speed + o.phase;
      o.mesh.position.set(Math.cos(t) * o.rx, o.y + Math.sin(t * 2.3) * 0.25, Math.sin(t) * o.rz);
      o.mesh.rotation.y = -t - (Math.PI / 2) * Math.sign(o.speed);
    }
    for (const w of model.sweepers) {
      const span = w.to - w.from;
      // Always drawn (never toggled invisible), so what the GPU holds does not depend on when it is sampled.
      w.mesh.position.z = w.from + ((clock.current * w.speed) % span);
    }
    for (const s of model.streams) {
      const attribute = s.points.geometry.getAttribute('position');
      for (let i = 0; i < attribute.count; i++) {
        const y = attribute.getY(i) + s.speed * delta;
        attribute.setY(i, y > s.height ? y - s.height : y);
      }
      attribute.needsUpdate = true;
    }
    for (const p of model.pulsers)
      (p.material as unknown as { emissiveIntensity: number }).emissiveIntensity =
        p.base + p.amplitude * Math.sin(clock.current * p.speed);
    // The next frame is requested by AnimationClock, which sets the pace.
  });
  void detail;
  return <primitive object={model.group} position={[0, y, 0]} dispose={null} />;
});

type FlyTo = { id: number; target: [number, number, number]; offset: [number, number, number] };

const MIN_DISTANCE = 4;
const MAX_DISTANCE = 300;

function SceneCamera({
  command,
  reducedMotion,
  onUserCamera,
  keyboardRef,
}: {
  command: FlyTo;
  reducedMotion: boolean;
  onUserCamera?: (() => void) | undefined;
  keyboardRef: RefObject<Set<string>>;
}) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const goal = useRef<{ target: Vector3; position: Vector3 } | null>(null);
  useEffect(() => {
    const target = new Vector3(...command.target);
    const position = target.clone().add(new Vector3(...command.offset));
    if (reducedMotion || !controls.current) {
      controls.current?.target.copy(target);
      camera.position.copy(position);
      camera.lookAt(target);
      controls.current?.update();
      goal.current = null;
    } else goal.current = { target, position };
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
    if (g) {
      const k = 1 - Math.exp(-delta * 4.5);
      c.target.lerp(g.target, k);
      camera.position.lerp(g.position, k);
      c.update();
      invalidate();
      if (c.target.distanceTo(g.target) < 0.04 && camera.position.distanceTo(g.position) < 0.08)
        goal.current = null;
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

function Runtime({ onFailure }: { onFailure: () => void }) {
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

function AnimationClock({ active, smooth }: { active: boolean; smooth: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  const timer = useRef<number | undefined>(undefined);
  useFrame(() => {
    if (!active || document.hidden) return;
    if (smooth) invalidate();
    else if (timer.current === undefined)
      timer.current = window.setTimeout(() => {
        timer.current = undefined;
        invalidate();
      }, AMBIENT_FRAME_MS);
  });
  useEffect(() => {
    if (active) invalidate();
    return () => window.clearTimeout(timer.current);
  }, [active, invalidate]);
  return null;
}

class SceneBoundary extends Component<
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

function ProjectedLabels({
  labels,
  elements,
  selected,
}: {
  labels: { id: string; x: number; y: number; z: number; width: number }[];
  elements: Map<string, HTMLElement>;
  selected: string | null;
}) {
  const point = useRef(new Vector3());
  useFrame(({ camera, size }) => {
    const occupied: { x: number; y: number; width: number }[] = [];
    for (const label of [...labels].sort(
      (a, b) => Number(b.id === selected) - Number(a.id === selected),
    )) {
      const element = elements.get(label.id);
      if (!element) continue;
      point.current.set(label.x, label.y, label.z).project(camera);
      const x = ((point.current.x + 1) * size.width) / 2,
        y = ((1 - point.current.y) * size.height) / 2;
      const visible =
        point.current.z >= -1 &&
        point.current.z <= 1 &&
        x > 0 &&
        x < size.width &&
        y > 55 &&
        y < size.height - 30 &&
        !occupied.some(
          (p) => Math.abs(p.x - x) < (p.width + label.width) / 2 + 5 && Math.abs(p.y - y) < 30,
        );
      element.style.visibility = visible ? 'visible' : 'hidden';
      element.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`;
      if (visible) occupied.push({ x, y, width: label.width });
    }
  });
  return null;
}

// What each activity looks like above a character's head. Only real states are drawn; offline has no beacon.
const BEACON: Partial<Record<Agent['activity'], { color: string; size: number; pulse: boolean }>> =
  {
    working: { color: '#43e6df', size: 0.16, pulse: false },
    reviewing: { color: '#a592ff', size: 0.16, pulse: false },
    waiting_permission: { color: '#ffc65c', size: 0.2, pulse: true },
    waiting_peer: { color: '#6aa8ff', size: 0.16, pulse: true },
    error: { color: '#ff7a85', size: 0.2, pulse: true },
    idle: { color: '#4d6a78', size: 0.1, pulse: false },
    starting: { color: '#43e6df', size: 0.12, pulse: true },
  };

function Beacons({
  items,
  animate,
}: {
  items: { id: string; x: number; y: number; z: number; activity: Agent['activity'] }[];
  animate: boolean;
}) {
  const meshes = useRef(new Map<string, Mesh>());
  const clock = useRef(0);
  useFrame((_state, delta) => {
    if (!animate) return;
    clock.current += delta;
    for (const item of items) {
      const mesh = meshes.current.get(item.id);
      const look = BEACON[item.activity];
      if (!mesh || !look) continue;
      mesh.rotation.y += delta * 1.6;
      mesh.position.y = item.y + Math.sin(clock.current * 2 + item.x) * 0.06;
      if (look.pulse) mesh.scale.setScalar(1 + 0.25 * Math.sin(clock.current * 5));
    }
  });
  return (
    <>
      {items.map((item) => {
        const look = BEACON[item.activity];
        if (!look) return null;
        return (
          <mesh
            key={item.id}
            ref={(node) => {
              if (node) meshes.current.set(item.id, node);
              else meshes.current.delete(item.id);
            }}
            position={[item.x, item.y, item.z]}
          >
            <octahedronGeometry args={[look.size, 0]} />
            <meshBasicMaterial color={look.color} transparent opacity={0.95} toneMapped={false} />
          </mesh>
        );
      })}
    </>
  );
}

/** A member's own screen: role-themed art whose brightness follows the member's real activity. */
function MemberScreen({
  role,
  member,
  accent,
  activity,
}: {
  role: string;
  member: string;
  accent: string;
  activity: Agent['activity'];
}) {
  const texture = useMemo(() => screenTexture(role, member, accent), [role, member, accent]);
  const opacity =
    activity === 'offline' || activity === 'unknown'
      ? 0.12
      : ['working', 'reviewing', 'waiting_permission', 'waiting_peer'].includes(activity)
        ? 1
        : 0.5;
  return (
    <mesh position={[0, 1.16, -0.3]}>
      <planeGeometry args={[0.66, (0.66 * SCREEN_H) / SCREEN_W]} />
      <meshBasicMaterial map={texture} transparent opacity={opacity} toneMapped={false} side={2} />
    </mesh>
  );
}

/**
 * Each member's branch as a beam of light from the desk into the elevator core, which stands for the default branch.
 * A linked worktree is cyan, the main checkout white, uncommitted work amber; while the member works the beam flows
 * toward the core. Only real Git state is drawn: no beam without a branch.
 */
function BranchBeam({
  from,
  to,
  color,
  flowing,
  animate,
}: {
  from: [number, number, number];
  to: [number, number, number];
  color: string;
  flowing: boolean;
  animate: boolean;
}) {
  const curve = useMemo(
    () =>
      new QuadraticBezierCurve3(
        new Vector3(...from),
        new Vector3((from[0] + to[0]) / 2, Math.max(from[1], to[1]) + 2.2, (from[2] + to[2]) / 2),
        new Vector3(...to),
      ),
    [from[0], from[1], from[2], to[0], to[1], to[2]], // eslint-disable-line react-hooks/exhaustive-deps -- by value
  );
  const geometry = useMemo(
    () => new TubeGeometry(curve, 28, flowing ? 0.075 : 0.055, 6, false),
    [curve, flowing],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  const packets = useRef<(Mesh | null)[]>([]);
  const clock = useRef(0);
  useFrame((_state, delta) => {
    if (!flowing || !animate) return;
    clock.current += delta;
    packets.current.forEach((mesh, i) => {
      if (!mesh) return;
      mesh.position.copy(curve.getPoint((clock.current * 0.35 + i / 3) % 1));
    });
  });
  return (
    <group>
      <mesh geometry={geometry}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={flowing ? 0.9 : 0.4}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {flowing &&
        [0, 1, 2].map((i) => (
          <mesh
            key={i}
            ref={(node) => {
              packets.current[i] = node;
            }}
            position={curve.getPoint(i / 3)}
          >
            <sphereGeometry args={[0.11, 10, 8]} />
            <meshBasicMaterial color={color} toneMapped={false} />
          </mesh>
        ))}
    </group>
  );
}

/**
 * Each member's branch as a tube of light from the desk into the elevator core, which stands for the default branch.
 * A linked worktree is cyan, the main checkout white, a detached checkout violet, uncommitted work amber; while the
 * member works, packets travel
 * along it into the core. Only real Git state is drawn: no beam outside a repository.
 */
function BranchBeams({
  beams,
  animate,
}: {
  beams: {
    id: string;
    from: [number, number, number];
    to: [number, number, number];
    color: string;
    flowing: boolean;
  }[];
  animate: boolean;
}) {
  return (
    <>
      {beams.map((beam) => (
        <BranchBeam key={beam.id} {...beam} animate={animate} />
      ))}
    </>
  );
}

const ACTIVE: readonly Agent['activity'][] = [
  'working',
  'reviewing',
  'waiting_permission',
  'waiting_peer',
];
const FOLLOW_MS = 7000;

const PIPS = 8;
const pad = (n: number) => String(n).padStart(3, '0');
const KEYS = new Set([
  'w',
  'a',
  's',
  'd',
  'q',
  'e',
  '=',
  '+',
  '-',
  '_',
  'shift',
  'arrowup',
  'arrowdown',
  'arrowleft',
  'arrowright',
]);

export function OfficeScene(props: OfficeSceneProps) {
  const layout = useMemo(
    () => props.layout ?? defaultLayout(props.agents),
    [props.layout, props.agents],
  );
  const zh = props.locale === 'zh-TW';
  const elements = useRef(new Map<string, HTMLElement>());
  const keys = useRef(new Set<string>());
  const [floor, setFloor] = useState(0);
  const [exploded, setExploded] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [following, setFollowing] = useState<string | null>(null);
  const [follow, setFollow] = useState(false);
  const [panelOpen, setPanelOpen] = useState(() => {
    try {
      return localStorage.getItem('aether-building-panel') !== 'closed';
    } catch {
      return true;
    }
  });
  const togglePanel = () =>
    setPanelOpen((open) => {
      try {
        localStorage.setItem('aether-building-panel', open ? 'closed' : 'open');
      } catch {
        /* a private window: the choice just is not remembered */
      }
      return !open;
    });
  const [command, setCommand] = useState<FlyTo>({
    id: 0,
    target: [0, 0, 0],
    offset: OVERVIEW(false),
  });
  const sequence = useRef(0);

  const floorOf = useCallback((agent: Agent) => floorOfDesk(layout, agent.id), [layout]);
  const perFloor = useMemo(() => {
    const counts = Array.from({ length: FLOORS }, () => ({ total: 0, working: 0 }));
    for (const agent of props.agents) {
      const entry = counts[Math.min(FLOORS - 1, floorOfDesk(layout, agent.id))]!;
      entry.total++;
      if (['working', 'reviewing'].includes(agent.activity)) entry.working++;
    }
    return counts;
  }, [props.agents, layout]);

  // Start on the busiest floor (most work, then most members) until the user picks one themselves.
  const userChoseFloor = useRef(false);
  useEffect(() => {
    if (userChoseFloor.current) return;
    let best = -1;
    let score = 0;
    perFloor.forEach((entry, i) => {
      const s = entry.working * 1000 + entry.total;
      if (s > score) [best, score] = [i, s];
    });
    if (best >= 0 && best !== floor) {
      setFloor(best);
      fly([0, lookY(best, exploded), 0], OVERVIEW(exploded));
    }
  }, [perFloor]); // eslint-disable-line react-hooks/exhaustive-deps -- only the head count decides the starting floor

  const fly = useCallback((target: [number, number, number], offset: [number, number, number]) => {
    sequence.current += 1;
    setCommand({ id: sequence.current, target, offset });
  }, []);
  const goToFloor = useCallback(
    (next: number, isExploded = exploded) => {
      userChoseFloor.current = true;
      const clamped = Math.min(FLOORS - 1, Math.max(0, next));
      setFloor(clamped);
      fly([0, lookY(clamped, isExploded), 0], OVERVIEW(isExploded));
    },
    [exploded, fly],
  );

  // Close-up tracking: every few seconds the camera moves to the next active member, across floors, until the user
  // takes the camera back. Only members whose real state is active are visited.
  const followList = useRef<Agent[]>([]);
  followList.current = props.agents.filter(
    (a) => ACTIVE.includes(a.activity) && layout.objects.some((o) => o.agentId === a.id),
  );
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  useEffect(() => {
    if (!follow) {
      setFollowing(null);
      return;
    }
    let index = 0;
    const step = () => {
      const list = followList.current;
      if (!list.length) {
        setFollowing(null);
        return;
      }
      const agent = list[index++ % list.length]!;
      const seat = layoutRef.current.objects.find((o) => o.agentId === agent.id);
      if (!seat) return;
      const f = seat.floor ?? 0;
      setExploded(false);
      setFloor(f);
      fly([seat.x, floorY(f, false) + 0.9, seat.z + 0.6], FOLLOW_OFFSET);
      setFollowing(agent.id);
    };
    step();
    const timer = setInterval(step, FOLLOW_MS);
    return () => clearInterval(timer);
  }, [follow, fly]);
  const userCamera = useCallback(() => {
    setFollow(false);
    props.onUserCamera?.();
  }, [props.onUserCamera]); // eslint-disable-line react-hooks/exhaustive-deps -- only the callback matters

  // The same focus values as before: overview, a zone or an agent. Focusing an agent switches to its floor.
  useEffect(() => {
    const seat = layout.objects.find((o) => o.agentId === props.focus);
    const zone = zones.find((z) => z.id === props.focus);
    if (seat) {
      const f = seat.floor ?? 0;
      setFloor(f);
      fly([seat.x, floorY(f, exploded) + 0.7, seat.z], AGENT_OFFSET);
    } else if (zone) fly([zone.x, floorY(floor, exploded), zone.z], ZONE_OFFSET);
    else fly([0, lookY(floor, exploded), 0], OVERVIEW(exploded));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focus changes drive the camera, not floor or layout edits
  }, [props.focus]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(input|textarea|select)$/i.test(target.tagName)) return;
      const key = event.key.toLowerCase();
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (KEYS.has(key)) {
        keys.current.add(key);
        userCamera();
        if (key.startsWith('arrow')) event.preventDefault();
      } else if (/^[1-5]$/.test(key)) goToFloor(Number(key) - 1);
      else if (key === ']' || key === 'pageup') goToFloor(floor + 1);
      else if (key === '[' || key === 'pagedown') goToFloor(floor - 1);
      else if (key === 'f') setFollow((v) => !v);
      else if (key === 'x') {
        setExploded((v) => {
          goToFloor(floor, !v);
          return !v;
        });
      } else if (key === 'home' || key === '0') goToFloor(floor);
    };
    const up = (event: KeyboardEvent) => keys.current.delete(event.key.toLowerCase());
    const blur = () => keys.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [floor, goToFloor, userCamera]);

  const visibleFloors = exploded
    ? Array.from({ length: FLOORS }, (_, i) => i)
    : Array.from({ length: floor + 1 }, (_, i) => i);
  const onScene = (agent: Agent) => exploded || floorOf(agent) === floor;
  const sceneAgents = props.agents.filter(onScene);
  const labels = [
    ...sceneAgents.flatMap((a) => {
      const d = layout.objects.find((o) => o.agentId === a.id);
      return d
        ? [
            {
              id: a.id,
              x: d.x,
              y: floorY(d.floor ?? 0, exploded) + 2,
              z: d.z,
              width: a.name.length * 6 + 25,
            },
          ]
        : [];
    }),
    ...(exploded ? [] : floorZones(floor).filter((z) => z.id !== 'atrium')).map((z) => ({
      id: z.id,
      x: z.x,
      y: floorY(floor, exploded) + 0.14,
      z: z.z + 3.1,
      width: 110,
    })),
  ];
  const animate = !props.reducedMotion && props.quality !== 'low';
  const active =
    animate ||
    (props.agents.some((a) =>
      ['working', 'reviewing', 'waiting_permission', 'waiting_peer'].includes(a.activity),
    ) &&
      !props.reducedMotion);
  const y = floorY(floor, exploded);
  const floorLayout = useMemo(
    () => ({ ...layout, objects: layout.objects.filter((o) => (o.floor ?? 0) === floor) }),
    [layout, floor],
  );
  const department = DEPARTMENTS[floor]!;

  return (
    <SceneBoundary onFailure={props.onFailure}>
      <div className="canvas-container">
        <Canvas
          shadows={props.quality !== 'low'}
          camera={{ position: OVERVIEW(false), fov: 38, near: 0.4, far: 2400 }}
          frameloop="demand"
          dpr={props.quality === 'high' ? [1, 2] : props.quality === 'balanced' ? [1, 1.5] : 1}
          gl={{
            antialias: props.quality !== 'low',
            powerPreference: 'high-performance',
            alpha: false,
          }}
        >
          <color attach="background" args={['#050e15']} />
          <fog attach="fog" args={['#050e15', 170, 520]} />
          <OrbitalBackdrop low={props.quality === 'low'} />
          <ambientLight intensity={0.95} color="#9fd8ff" />
          <hemisphereLight args={['#cfeeff', '#25414d', 1.7]} />
          <group position={[0, y, 0]}>
            <directionalLight
              position={[-25, 40, 15]}
              intensity={2.4}
              color="#e8f6ff"
              castShadow={props.quality !== 'low'}
              shadow-mapSize={props.quality === 'high' ? 4096 : 2048}
              shadow-camera-left={-38}
              shadow-camera-right={38}
              shadow-camera-top={30}
              shadow-camera-bottom={-30}
              shadow-camera-far={110}
              shadow-normalBias={0.05}
            />
            <directionalLight position={[20, 15, -20]} intensity={1.2} color={department.accent} />
          </group>
          {visibleFloors.map((index) => (
            <Floor
              key={index}
              layout={layout}
              floor={index}
              y={floorY(index, exploded)}
              animate={animate && (exploded || index === floor)}
              detail={props.quality === 'high'}
            />
          ))}
          {sceneAgents.map((agent) => {
            const desk = layout.objects.find((o) => o.agentId === agent.id);
            if (!desk) return null;
            return (
              <group
                key={agent.id}
                position={[desk.x, floorY(desk.floor ?? 0, exploded), desk.z]}
                rotation={[0, (desk.rotation * Math.PI) / 2, 0]}
              >
                <MemberScreen
                  role={props.roleOf?.(agent) ?? 'generalist'}
                  member={agent.id}
                  accent={DEPARTMENTS[desk.floor ?? 0]?.accent ?? '#43e6df'}
                  activity={agent.activity}
                />
                <group
                  position={[0, 0, 0.86]}
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onSelect(agent.id);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    props.onSelect(agent.id);
                    fly([desk.x, floorY(desk.floor ?? 0, exploded) + 0.7, desk.z], AGENT_OFFSET);
                  }}
                  onPointerOver={(e) => {
                    e.stopPropagation();
                    setHovered(agent.id);
                    document.body.style.cursor = 'pointer';
                  }}
                  onPointerOut={() => {
                    setHovered((h) => (h === agent.id ? null : h));
                    document.body.style.cursor = '';
                  }}
                >
                  <Animal
                    agent={agent}
                    apparition={props.apparitions?.[agent.id]}
                    selected={agent.id === props.selectedId || agent.id === hovered}
                    reducedMotion={props.reducedMotion}
                    quality={props.quality}
                    onError={props.onFailure}
                  />
                  {(props.zombies?.[agent.id] ?? 0) > 0 && (
                    <Animal
                      agent={agent}
                      apparition="zombie"
                      selected={false}
                      reducedMotion={props.reducedMotion}
                      quality={props.quality}
                      onError={props.onFailure}
                    />
                  )}
                </group>
              </group>
            );
          })}
          <group position={[0, y, 0]}>
            <MessageCarriers
              layout={floorLayout}
              messages={props.messages ?? []}
              reducedMotion={props.reducedMotion}
              onUnreachable={props.onMessageUnreachable}
            />
          </group>
          <ProjectedLabels
            labels={labels}
            elements={elements.current}
            selected={props.selectedId}
          />
          <SceneCamera
            command={command}
            reducedMotion={props.reducedMotion}
            onUserCamera={userCamera}
            keyboardRef={keys}
          />
          <Runtime onFailure={props.onFailure} />
          {props.onPerfReport && (
            <PerfProbe quality={props.quality} onReport={props.onPerfReport} />
          )}
          {props.branchOf && (
            <BranchBeams
              animate={!props.reducedMotion}
              beams={sceneAgents.flatMap((agent) => {
                const info = props.branchOf!(agent);
                const desk = layout.objects.find((o) => o.agentId === agent.id);
                if (!info || !desk) return [];
                const y = floorY(desk.floor ?? 0, exploded);
                return [
                  {
                    id: agent.id,
                    from: [desk.x, y + 1.45, desk.z - 0.3] as [number, number, number],
                    to: [0, y + 5.4, 0] as [number, number, number],
                    color:
                      info.dirty > 0
                        ? '#ffc65c'
                        : !info.branch
                          ? '#a592ff'
                          : info.linked
                            ? '#43e6df'
                            : '#e8f2f8',
                    flowing: ACTIVE.includes(agent.activity),
                  },
                ];
              })}
            />
          )}
          <Beacons
            animate={!props.reducedMotion}
            items={sceneAgents.flatMap((agent) => {
              const desk = layout.objects.find((o) => o.agentId === agent.id);
              if (!desk) return [];
              const turn = (desk.rotation * Math.PI) / 2;
              return [
                {
                  id: agent.id,
                  x: desk.x + Math.sin(turn) * 0.86,
                  y: floorY(desk.floor ?? 0, exploded) + 2.25,
                  z: desk.z + Math.cos(turn) * 0.86,
                  activity: agent.activity,
                },
              ];
            })}
          />
          <AnimationClock active={active || follow} smooth={follow} />
        </Canvas>
        <div className="world-labels">
          {sceneAgents.map((agent) => (
            <button
              key={agent.id}
              ref={(node) => {
                if (node) elements.current.set(agent.id, node);
                else elements.current.delete(agent.id);
              }}
              className={`scene-label ${agent.id === props.selectedId ? 'selected' : ''} ${agent.id === hovered ? 'hovered' : ''} ${props.unreadIds?.has(agent.id) ? 'unread' : ''}`}
              onClick={() => props.onSelect(agent.id)}
              onPointerEnter={() => setHovered(agent.id)}
              onPointerLeave={() => setHovered((h) => (h === agent.id ? null : h))}
            >
              <span style={{ background: agent.color }} />
              {agent.name}
              {agent.id === hovered && <small>{agent.role}</small>}
            </button>
          ))}
          {!exploded &&
            floorZones(floor)
              .filter((z) => z.id !== 'atrium')
              .map((zone) => (
                <button
                  className="zone-label"
                  key={zone.id}
                  tabIndex={-1}
                  ref={(node) => {
                    if (node) elements.current.set(zone.id, node);
                    else elements.current.delete(zone.id);
                  }}
                  onClick={() => fly([zone.x, floorY(floor, exploded), zone.z], ZONE_OFFSET)}
                >
                  {zh ? zone.zh : zone.en}
                </button>
              ))}
        </div>
        {follow && (
          <div className="follow-hud fui" role="status">
            <small>{zh ? '近景追蹤' : 'TRACKING'}</small>
            {(() => {
              const agent = props.agents.find((a) => a.id === following);
              return agent ? (
                <>
                  <b>{agent.name}</b>
                  <span>
                    {agent.role} · {agent.activity}
                  </span>
                </>
              ) : (
                <span>{zh ? '目前沒有活躍成員' : 'No active member right now'}</span>
              );
            })()}
          </div>
        )}
        <div className="floor-hud fui" style={{ ['--accent' as string]: department.accent }}>
          <small>
            {exploded
              ? zh
                ? '全棟總覽'
                : 'BUILDING OVERVIEW'
              : `${zh ? '樓層' : 'FLOOR'} ${String(floor + 1).padStart(2, '0')} / ${String(FLOORS).padStart(2, '0')}`}
          </small>
          <b>
            {exploded ? (zh ? '分層展開' : 'Exploded view') : zh ? department.zh : department.en}
          </b>
          <div className="readouts">
            <span>
              {zh ? '成員' : 'MEM'}{' '}
              <i>{pad(exploded ? props.agents.length : perFloor[floor]!.total)}</i>
            </span>
            <span>
              {zh ? '進行中' : 'ACT'}{' '}
              <i>
                {pad(
                  exploded ? perFloor.reduce((n, f) => n + f.working, 0) : perFloor[floor]!.working,
                )}
              </i>
            </span>
          </div>
        </div>
        <nav
          className={`building-panel fui ${panelOpen ? '' : 'collapsed'}`}
          aria-label={zh ? '樓層' : 'Floors'}
        >
          <div className="building-head">
            <span>{zh ? '樓層' : 'DECKS'}</span>
            <button aria-expanded={panelOpen} onClick={togglePanel}>
              {panelOpen ? (zh ? '收合' : 'HIDE') : zh ? '展開' : 'SHOW'}
            </button>
          </div>
          {panelOpen && (
            <>
              <ol>
                {[...DEPARTMENTS].reverse().map((d) => {
                  const entry = perFloor[d.floor]!;
                  const lit = entry.total
                    ? Math.max(
                        entry.working ? 1 : 0,
                        Math.round((entry.working / entry.total) * PIPS),
                      )
                    : 0;
                  return (
                    <li key={d.id}>
                      <button
                        className={`slab ${d.floor === floor && !exploded ? 'current' : ''}`}
                        aria-current={d.floor === floor ? 'true' : undefined}
                        onClick={() => {
                          if (exploded) setExploded(false);
                          goToFloor(d.floor, false);
                        }}
                        style={{ ['--accent' as string]: d.accent }}
                      >
                        <b>{d.floor + 1}F</b>
                        <span>{zh ? d.zh : d.en}</span>
                        <i title={zh ? '成員 · 進行中' : 'members · active'}>{pad(entry.total)}</i>
                        <em className="pips" aria-hidden="true">
                          {Array.from({ length: PIPS }, (_, n) => (
                            <u key={n} className={n < lit ? 'on' : ''} />
                          ))}
                        </em>
                      </button>
                    </li>
                  );
                })}
              </ol>
              <div className="building-tools">
                <button
                  aria-pressed={exploded}
                  onClick={() => {
                    const next = !exploded;
                    setExploded(next);
                    goToFloor(floor, next);
                  }}
                >
                  {zh ? '分層展開' : 'EXPLODE'}
                </button>
                <button aria-pressed={follow} onClick={() => setFollow((v) => !v)}>
                  {zh ? '追蹤' : 'FOLLOW'}
                </button>
                <button aria-expanded={helpOpen} onClick={() => setHelpOpen((v) => !v)}>
                  {zh ? '操作' : 'KEYS'}
                </button>
              </div>
              {helpOpen && (
                <dl className="keys-help">
                  <dt>WASD / ←↑↓→</dt>
                  <dd>{zh ? '平移（Shift 加速）' : 'Pan (Shift = faster)'}</dd>
                  <dt>Q / E</dt>
                  <dd>{zh ? '旋轉視角' : 'Rotate'}</dd>
                  <dt>+ / − · {zh ? '滾輪' : 'wheel'}</dt>
                  <dd>{zh ? '縮放' : 'Zoom'}</dd>
                  <dt>1–5 · [ ]</dt>
                  <dd>{zh ? '切換樓層' : 'Change floor'}</dd>
                  <dt>F</dt>
                  <dd>{zh ? '近景追蹤活躍成員' : 'Track active members'}</dd>
                  <dt>X</dt>
                  <dd>{zh ? '分層展開' : 'Exploded view'}</dd>
                  <dt>{zh ? '雙擊角色' : 'Double-click'}</dt>
                  <dd>{zh ? '飛到座位' : 'Fly to desk'}</dd>
                </dl>
              )}
            </>
          )}
        </nav>
      </div>
    </SceneBoundary>
  );
}
