import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  Suspense,
  Component,
  type ReactNode,
  type ComponentRef,
} from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Vector3, type Group } from 'three';
import type { Agent, Layout } from '@aether/contracts';
import { buildCampus } from './campus.js';
import { disposeOwned } from './geometry.js';
import { defaultLayout, zones } from './layout.js';
import { OrbitalBackdrop } from './OrbitalBackdrop.js';
import { Animal } from './Animal.js';
import { MessageCarriers } from './MessageCarriers.js';
import { PerfProbe } from './PerfProbe.js';
import type { PerfReport } from './perf.js';
import type { SceneMessage } from './carriers.js';
export type Quality = 'low' | 'balanced' | 'high';
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
  /** When set, the scene renders continuously for a fixed sample and reports measured frame times. */
  onPerfReport?: (report: PerfReport) => void;
};
const Campus = memo(function Campus({ layout }: { layout: Layout }) {
  const scene = useMemo(() => buildCampus(layout), [layout]);
  useEffect(() => () => disposeOwned(scene), [scene]);
  return <primitive object={scene} dispose={null} />;
});
function SceneCamera({
  focus,
  layout,
  reducedMotion,
  onUserCamera,
}: {
  focus: string;
  layout: Layout;
  reducedMotion: boolean;
  onUserCamera?: (() => void) | undefined;
}) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const seat = layout.objects.find((o) => o.agentId === focus);
    const zone = zones.find((z) => z.id === focus);
    const target = seat ? [seat.x, 0.7, seat.z] : zone ? [zone.x, 0, zone.z] : [0, 0, 0];
    const offset = seat ? [5, 4.5, 6] : zone ? [19, 17, 22] : [43, 43, 52];
    controls.current?.target.set(...(target as [number, number, number]));
    camera.position.set(target[0]! + offset[0]!, target[1]! + offset[1]!, target[2]! + offset[2]!);
    camera.lookAt(...(target as [number, number, number]));
    if ('zoom' in camera) {
      camera.zoom = seat ? 70 : zone ? 21 : 12;
      camera.updateProjectionMatrix();
    }
    controls.current?.update();
    invalidate();
  }, [focus, layout, camera, invalidate]);
  useEffect(() => {
    const instance = controls.current;
    if (!instance || !onUserCamera) return;
    // 'start' fires only for user input, never for programmatic camera moves.
    instance.addEventListener('start', onUserCamera);
    return () => instance.removeEventListener('start', onUserCamera);
  }, [onUserCamera]);
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping={!reducedMotion}
      dampingFactor={0.08}
      minZoom={7}
      maxZoom={110}
      maxPolarAngle={Math.PI / 2.13}
      minPolarAngle={0.18}
      maxDistance={120}
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
function AnimationClock({ active }: { active: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  useFrame(() => {
    if (active && !document.hidden) invalidate();
  });
  useEffect(() => {
    if (active) invalidate();
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
export function OfficeScene(props: OfficeSceneProps) {
  const layout = useMemo(
    () => props.layout ?? defaultLayout(props.agents),
    [props.layout, props.agents],
  );
  const elements = useRef(new Map<string, HTMLElement>());
  const labels = [
    ...props.agents.flatMap((a) => {
      const d = layout.objects.find((o) => o.agentId === a.id);
      return d ? [{ id: a.id, x: d.x, y: 2, z: d.z, width: a.name.length * 6 + 25 }] : [];
    }),
    ...zones
      .filter((z) => z.id !== 'atrium')
      .map((z) => ({ id: z.id, x: z.x, y: 0.14, z: z.z + 3.1, width: 90 })),
  ];
  const active =
    props.agents.some((a) =>
      ['working', 'reviewing', 'waiting_permission', 'waiting_peer'].includes(a.activity),
    ) && !props.reducedMotion;
  return (
    <SceneBoundary onFailure={props.onFailure}>
      <div className="canvas-container">
        <Canvas
          shadows={props.quality !== 'low'}
          orthographic
          camera={{ position: [43, 43, 52], zoom: 12, near: 0.1, far: 500 }}
          frameloop="demand"
          dpr={props.quality === 'high' ? [1, 2] : props.quality === 'balanced' ? [1, 1.5] : 1}
          gl={{
            antialias: props.quality !== 'low',
            powerPreference: 'high-performance',
            alpha: false,
          }}
        >
          <color attach="background" args={['#10242d']} />
          <fog attach="fog" args={['#10242d', 135, 280]} />
          <OrbitalBackdrop low={props.quality === 'low'} />
          <ambientLight intensity={0.9} />
          <hemisphereLight args={['#d6efff', '#b99e80', 1.7]} />
          <directionalLight
            position={[-25, 40, 15]}
            intensity={3.2}
            color="#fff1d6"
            castShadow={props.quality !== 'low'}
            shadow-mapSize={props.quality === 'high' ? 4096 : 2048}
            shadow-camera-left={-38}
            shadow-camera-right={38}
            shadow-camera-top={30}
            shadow-camera-bottom={-30}
            shadow-camera-far={110}
            shadow-normalBias={0.05}
          />
          <directionalLight position={[20, 15, -20]} intensity={1.6} color="#addef3" />
          <Campus layout={layout} />
          {props.agents.map((agent) => {
            const desk = layout.objects.find((o) => o.agentId === agent.id);
            if (!desk) return null;
            return (
              <group
                key={agent.id}
                position={[desk.x, 0, desk.z]}
                rotation={[0, (desk.rotation * Math.PI) / 2, 0]}
              >
                <group
                  position={[0, 0, 0.86]}
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onSelect(agent.id);
                  }}
                >
                  <Animal
                    agent={agent}
                    selected={agent.id === props.selectedId}
                    reducedMotion={props.reducedMotion}
                    quality={props.quality}
                    onError={props.onFailure}
                  />
                </group>
              </group>
            );
          })}
          <MessageCarriers
            layout={layout}
            messages={props.messages ?? []}
            reducedMotion={props.reducedMotion}
            onUnreachable={props.onMessageUnreachable}
          />
          <ProjectedLabels
            labels={labels}
            elements={elements.current}
            selected={props.selectedId}
          />
          <SceneCamera
            focus={props.focus}
            layout={layout}
            reducedMotion={props.reducedMotion}
            onUserCamera={props.onUserCamera}
          />
          <Runtime onFailure={props.onFailure} />
          {props.onPerfReport && (
            <PerfProbe quality={props.quality} onReport={props.onPerfReport} />
          )}
          <AnimationClock active={active} />
        </Canvas>
        <div className="world-labels">
          {props.agents.map((agent) => (
            <button
              key={agent.id}
              ref={(node) => {
                if (node) elements.current.set(agent.id, node);
                else elements.current.delete(agent.id);
              }}
              className={`scene-label ${agent.id === props.selectedId ? 'selected' : ''}`}
              onClick={() => props.onSelect(agent.id)}
            >
              <span style={{ background: agent.color }} />
              {agent.name}
            </button>
          ))}
          {zones
            .filter((z) => z.id !== 'atrium')
            .map((zone) => (
              <div
                className="zone-label"
                key={zone.id}
                ref={(node) => {
                  if (node) elements.current.set(zone.id, node);
                  else elements.current.delete(zone.id);
                }}
              >
                {props.locale === 'zh-TW' ? zone.zh : zone.en}
              </div>
            ))}
        </div>
      </div>
    </SceneBoundary>
  );
}
