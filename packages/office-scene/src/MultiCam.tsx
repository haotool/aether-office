import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { PerspectiveCamera } from 'three';
import type { Seat } from './director.js';
import type { Feed } from './multi-view.js';
import { poseAt } from './shot-camera.js';

export const PIP = { width: 176, height: 110, gap: 8, right: 16, bottom: 44 } as const;

/**
 * Renders the scene again for each feed, through its own camera, into a small rectangle at the bottom right of the
 * canvas (the frames that sit over them are in PipWall). It takes over the render step, so it is only mounted while
 * there is a feed; with none, the canvas renders itself as usual.
 */
export function MultiCam({
  feeds,
  seats,
}: {
  feeds: readonly Feed[];
  seats: ReadonlyMap<string, Seat>;
}) {
  const camera = useMemo(() => new PerspectiveCamera(32, PIP.width / PIP.height, 0.4, 2400), []);
  useFrame(({ gl, scene, camera: main, size, clock }) => {
    gl.setScissorTest(false);
    gl.setViewport(0, 0, size.width, size.height);
    gl.render(scene, main);
    const total = feeds.length * PIP.width + (feeds.length - 1) * PIP.gap;
    feeds.forEach((feed, i) => {
      // A slow push in and back out, each view a little out of step with the next.
      const phase = (clock.elapsedTime / 16 + i * 0.31) % 1;
      const pose = poseAt(
        feed.shot,
        seats,
        phase < 0.5 ? phase * 2 : 2 - phase * 2,
        PIP.width / PIP.height,
      );
      camera.position.set(...pose.position);
      camera.fov = pose.fov;
      camera.updateProjectionMatrix();
      camera.lookAt(...pose.target);
      const x = size.width - PIP.right - total + i * (PIP.width + PIP.gap);
      gl.setViewport(x, PIP.bottom, PIP.width, PIP.height);
      gl.setScissor(x, PIP.bottom, PIP.width, PIP.height);
      gl.setScissorTest(true);
      gl.render(scene, camera);
    });
    gl.setScissorTest(false);
  }, 1);
  return null;
}
