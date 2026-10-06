import { OrbitalBackdrop } from './OrbitalBackdrop.js';
import type { Quality } from './scene-types.js';

/** The sky, fog and lights of the scene; the shadow-casting sun follows the floor on show. */
export function SceneLights(props: {
  y: number;
  accent: string;
  compact: boolean;
  quality: Quality;
}) {
  const { y, accent, compact, quality } = props;
  return (
    <>
      <color attach="background" args={['#050e15']} />
      <fog attach="fog" args={['#050e15', 170, 520]} />
      <OrbitalBackdrop low={compact || quality === 'low'} />
      <ambientLight intensity={0.95} color="#9fd8ff" />
      <hemisphereLight args={['#cfeeff', '#25414d', 1.7]} />
      <group position={[0, y, 0]}>
        <directionalLight
          position={[-25, 40, 15]}
          intensity={2.4}
          color="#e8f6ff"
          castShadow={!compact && quality !== 'low'}
          shadow-mapSize={quality === 'high' ? 4096 : 2048}
          shadow-camera-left={-38}
          shadow-camera-right={38}
          shadow-camera-top={30}
          shadow-camera-bottom={-30}
          shadow-camera-far={110}
          shadow-normalBias={0.05}
        />
        <directionalLight position={[20, 15, -20]} intensity={1.2} color={accent} />
      </group>
    </>
  );
}
