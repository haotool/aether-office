import { useEffect, useMemo, type MutableRefObject } from 'react';
import { useFrame, useThree, type RootState } from '@react-three/fiber';
import { PerspectiveCamera, type Scene, type WebGLRenderer } from 'three';
import type { Seat } from '../environment/director.js';
import type { Feed, Rect } from '../core/multi-view.js';
import { poseAt } from '../core/shot-camera.js';
import { useFrameGate } from './PerfControllers.js';

const BREATH_SECONDS = 24;

type MultiCamProps = {
  feeds: readonly Feed[];
  seats: ReadonlyMap<string, Seat>;
  exploded: boolean;
  wall: MutableRefObject<ReadonlyMap<string, Rect>>;
  fps?: number | undefined;
};

/**
 * Layout positions (offset*), not the painted ones: the frames animate in with a transform that must not move the
 * picture.
 */
function measureWall(root: HTMLElement): Map<string, Rect> {
  const rects = new Map<string, Rect>();
  for (const el of root.querySelectorAll<HTMLElement>('.pip[data-feed]')) {
    const feed = el.dataset['feed'];
    if (!feed || !el.offsetWidth) continue;
    let x = 0;
    let y = 0;
    for (
      let n: HTMLElement | null = el;
      n && n !== root;
      n = n.offsetParent as HTMLElement | null
    ) {
      x += n.offsetLeft;
      y += n.offsetTop;
    }
    rects.set(feed, { x, y, width: el.offsetWidth, height: el.offsetHeight });
  }
  return rects;
}

type Target = {
  renderer: WebGLRenderer;
  scene: Scene;
  size: RootState['size'];
  camera: PerspectiveCamera;
};

function renderFeed(
  { renderer, scene, size, camera }: Target,
  feed: Feed,
  rect: Rect,
  phase: number,
  seats: ReadonlyMap<string, Seat>,
  exploded: boolean,
) {
  const aspect = rect.width / rect.height;
  const pose = poseAt(feed.shot, seats, phase < 0.5 ? phase * 2 : 2 - phase * 2, aspect, exploded);
  camera.aspect = aspect;
  camera.fov = pose.fov;
  camera.updateProjectionMatrix();
  camera.position.set(...pose.position);
  camera.lookAt(...pose.target);
  const bottom = size.height - rect.y - rect.height; // WebGL counts from the bottom
  renderer.setViewport(rect.x, bottom, rect.width, rect.height);
  renderer.setScissor(rect.x, bottom, rect.width, rect.height);
  renderer.setScissorTest(true);
  renderer.render(scene, camera);
}

/**
 * Renders the scene again per feed through its own camera into the rectangle of its frame. The stylesheet lays the
 * frames out and this reads where they ended up, so the picture and its frame cannot drift apart.
 */
export function MultiCam({ feeds, seats, exploded, wall, fps }: MultiCamProps) {
  const camera = useMemo(() => new PerspectiveCamera(32, 1.6, 0.4, 2400), []);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const due = useFrameGate(fps);
  useEffect(() => {
    const root = gl.domElement.closest<HTMLElement>('.canvas-container');
    if (!root) return;
    const measure = () => {
      wall.current = measureWall(root);
      invalidate();
    };
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    for (const el of root.querySelectorAll('.pip[data-feed]')) observer.observe(el);
    measure();
    return () => {
      observer.disconnect();
      wall.current = new Map();
      invalidate();
    };
  }, [gl, invalidate, feeds, wall]);
  useFrame(({ gl: renderer, scene, camera: main, size, clock }) => {
    if (!due()) return;
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, size.width, size.height);
    renderer.render(scene, main);
    // The shadows are the main picture's: drawing them again for every small view would be the cost of five scenes.
    const shadows = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    feeds.forEach((feed, i) => {
      const rect = wall.current.get(feed.id);
      if (!rect) return;
      const phase = (clock.elapsedTime / BREATH_SECONDS + i * 0.31) % 1;
      renderFeed({ renderer, scene, size, camera }, feed, rect, phase, seats, exploded);
    });
    renderer.shadowMap.autoUpdate = shadows;
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, size.width, size.height);
  }, 1);
  return null;
}
