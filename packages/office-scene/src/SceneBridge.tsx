import { useEffect, type RefObject } from 'react';
import { useThree } from '@react-three/fiber';
import { Plane, Raycaster, Vector2, Vector3 } from 'three';

/** What the DOM layers over the canvas (marquee, seat drag) may ask of the 3D scene. */
export type SceneBridge = {
  /** The point on the horizontal plane `y` under a pointer position, as [x, z], or null when it looks at the sky. */
  groundAt: (clientX: number, clientY: number, y: number) => [number, number] | null;
  /** Where world points are on the canvas, in CSS pixels from its top left; points behind the camera are left out. */
  screenOf: (
    points: ReadonlyMap<string, [number, number, number]>,
  ) => Map<string, [number, number]>;
  /** The orbit controls listen to the pointer (off while a seat or a marquee is being dragged). */
  setOrbit: (enabled: boolean) => void;
};

/** Fills `bridge` with the camera's view of the world. Draws nothing. */
export function SceneBridgeProbe({ bridge }: { bridge: RefObject<SceneBridge | null> }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null;
  useEffect(() => {
    const ray = new Raycaster();
    const hit = new Vector3();
    const at = new Vector3();
    bridge.current = {
      groundAt(clientX, clientY, y) {
        const rect = gl.domElement.getBoundingClientRect();
        const ndc = new Vector2(
          ((clientX - rect.left) / rect.width) * 2 - 1,
          -((clientY - rect.top) / rect.height) * 2 + 1,
        );
        ray.setFromCamera(ndc, camera);
        return ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -y), hit)
          ? [hit.x, hit.z]
          : null;
      },
      screenOf(points) {
        const rect = gl.domElement.getBoundingClientRect();
        const out = new Map<string, [number, number]>();
        for (const [id, p] of points) {
          at.set(...p).project(camera);
          if (at.z < -1 || at.z > 1) continue;
          out.set(id, [((at.x + 1) * rect.width) / 2, ((1 - at.y) * rect.height) / 2]);
        }
        return out;
      },
      setOrbit(enabled) {
        if (controls) controls.enabled = enabled;
      },
    };
    return () => {
      bridge.current = null;
    };
  }, [bridge, camera, gl, controls]);
  return null;
}
