import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Layout } from '@aether/contracts';
import { buildFloor, disposeFloor } from '../environment/building.js';
import type { FloorModel } from '../environment/building-parts.js';
import { floorKey } from '../environment/layout.js';
import { setUniform } from '../environment/uniforms.js';

export const Floor = memo(function Floor({
  layout,
  floor,
  y,
  animate,
}: {
  layout: Layout;
  floor: number;
  y: number;
  animate: boolean;
}) {
  const key = floorKey(layout, floor);
  // Seating never changes the building, so only its furniture (the key) rebuilds it.
  const model = useMemo<FloorModel>(() => buildFloor(layout, floor), [key, floor]);
  useEffect(() => () => disposeFloor(model), [model]);
  const clock = useRef(0);
  useFrame((_state, delta) => {
    if (!animate || document.hidden) return;
    clock.current += delta;
    for (const s of model.spinners) s.mesh.rotation[s.axis] += s.speed * delta;
    for (const h of model.holograms) setUniform(h, 'time', clock.current);
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
      p.material.emissiveIntensity = p.base + p.amplitude * Math.sin(clock.current * p.speed);
  });
  return <primitive object={model.group} position={[0, y, 0]} dispose={null} />;
});
