import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, SRGBColorSpace, type Sprite } from 'three';

const LETTERS = 3;
const CYCLE_SECONDS = 3.3;

/** "Z z z" drifting up from a sleeper's head, each fading as it goes. Decoration for a dormant session, nothing more. */
export function Zzz({ reducedMotion }: { reducedMotion: boolean }) {
  const sprites = useRef<(Sprite | null)[]>([]);
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const g = canvas.getContext('2d')!;
    g.font = 'bold 96px ui-sans-serif, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = '#7fb2ff';
    g.shadowBlur = 14;
    g.fillStyle = '#eaf3ff';
    g.fillText('Z', 64, 70);
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, []);
  useFrame(({ clock }) => {
    sprites.current.forEach((sprite, i) => {
      if (!sprite) return;
      const t = reducedMotion
        ? 0.35 + i * 0.25
        : ((clock.elapsedTime + i * 1.1) % CYCLE_SECONDS) / CYCLE_SECONDS;
      sprite.position.set(Math.sin(t * 5) * 0.04 + t * 0.18, t * 0.6, 0);
      sprite.scale.setScalar(0.12 + t * 0.14);
      sprite.material.opacity = Math.sin(Math.min(1, t) * Math.PI) * 0.9;
    });
  });
  return (
    <group>
      {Array.from({ length: LETTERS }, (_, i) => (
        <sprite key={i} ref={(s) => void (sprites.current[i] = s)}>
          <spriteMaterial map={texture} transparent depthWrite={false} opacity={0} />
        </sprite>
      ))}
    </group>
  );
}
