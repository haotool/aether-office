import { useEffect, useMemo, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera } from 'three';
import type { Seat } from './director.js';
import type { Feed, Rect } from './multi-view.js';
import { poseAt } from './shot-camera.js';

/** A view pushes in over this many seconds and eases back out; each is a little out of step with the next. */
const BREATH_SECONDS = 24;

/**
 * Renders the scene again for each feed, through its own camera, into the rectangle of its frame (the frames, which are
 * in PipWall, are laid out by the stylesheet; this reads where they ended up, so the picture and its frame cannot drift
 * apart whatever the canvas size, and a wall the stylesheet hides gets no renders). It takes over the render step, so it
 * is only mounted while there is a feed; with none, the canvas renders itself as usual. `wall` is where the rectangles
 * are kept for whoever must keep clear of the views (the name tags).
 */
export function MultiCam({
  feeds,
  seats,
  exploded,
  wall,
}: {
  feeds: readonly Feed[];
  seats: ReadonlyMap<string, Seat>;
  exploded: boolean;
  wall: MutableRefObject<ReadonlyMap<string, Rect>>;
}) {
  const camera = useMemo(() => new PerspectiveCamera(32, 1.6, 0.4, 2400), []);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const root = gl.domElement.closest<HTMLElement>('.canvas-container');
    if (!root) return;
    // Layout positions (offset*), not the painted ones: the frames animate in with a transform that must not move the
    // picture.
    const measure = () => {
      const next = new Map<string, Rect>();
      for (const el of root.querySelectorAll<HTMLElement>('.pip[data-feed]')) {
        if (!el.offsetWidth) continue; // the stylesheet hides the wall here
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
        next.set(el.dataset.feed!, { x, y, width: el.offsetWidth, height: el.offsetHeight });
      }
      wall.current = next;
      invalidate();
    };
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    for (const el of root.querySelectorAll('.pip[data-feed]')) observer.observe(el);
    measure();
    return () => {
      observer.disconnect();
      wall.current = new Map();
      invalidate(); // a frame without the views, so none is left painted
    };
  }, [gl, invalidate, feeds, wall]);
  useFrame(({ gl: renderer, scene, camera: main, size, clock }) => {
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
      const aspect = rect.width / rect.height;
      const pose = poseAt(
        feed.shot,
        seats,
        phase < 0.5 ? phase * 2 : 2 - phase * 2,
        aspect,
        exploded,
      );
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
    });
    renderer.shadowMap.autoUpdate = shadows;
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, size.width, size.height);
  }, 1);
  return null;
}
