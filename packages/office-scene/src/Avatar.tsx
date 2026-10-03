import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import type { Agent } from '@aether/contracts';
const fur: Record<Agent['species'], string> = {
  fox: '#c77943',
  cat: '#88969a',
  rabbit: '#ece7dc',
  bear: '#8d6347',
  otter: '#85664d',
  raccoon: '#8c9189',
  panda: '#eee9dd',
  dog: '#c49663',
};
/** Interim procedural actor, visibly driven by canonical activity; the GLB pipeline replaces this component. */
export function Avatar({
  agent,
  selected,
  reducedMotion,
}: {
  agent: Agent;
  selected: boolean;
  reducedMotion: boolean;
}) {
  const head = useRef<Group>(null);
  const arms = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (reducedMotion) return;
    const typing = agent.activity === 'working';
    if (arms.current)
      arms.current.rotation.x = typing ? Math.sin(clock.elapsedTime * 8) * 0.045 : 0;
    if (head.current)
      head.current.rotation.y = typing ? Math.sin(clock.elapsedTime * 0.8) * 0.045 : 0;
  });
  const color = fur[agent.species];
  const longEars = agent.species === 'rabbit';
  const pointed = ['fox', 'cat', 'dog'].includes(agent.species);
  const faded = ['offline', 'unknown'].includes(agent.activity);
  return (
    <group rotation={[0, Math.PI, 0]} scale={0.95}>
      <mesh position={[0, 0.85, 0]} castShadow>
        <capsuleGeometry args={[0.18, 0.28, 4, 12]} />
        <meshStandardMaterial color={faded ? '#7c8487' : agent.color} roughness={0.88} />
      </mesh>
      <mesh position={[0, 1.025, 0.14]}>
        <boxGeometry args={[0.13, 0.045, 0.022]} />
        <meshStandardMaterial color="#e4dfca" />
      </mesh>
      <group ref={head} position={[0, 1.25, 0]}>
        <mesh castShadow scale={[1, 0.92, 0.9]}>
          <sphereGeometry args={[0.245, 16, 12]} />
          <meshStandardMaterial color={color} roughness={0.95} />
        </mesh>
        {[-1, 1].map((side) => (
          <group
            key={side}
            position={[side * 0.17, longEars ? 0.32 : 0.2, -0.02]}
            rotation={[0, 0, -side * 0.18]}
          >
            <mesh castShadow>
              {pointed ? (
                <coneGeometry args={[0.125, 0.26, 3]} />
              ) : (
                <sphereGeometry args={[longEars ? 0.07 : 0.092, 10, 8]} />
              )}
              <meshStandardMaterial color={agent.species === 'panda' ? '#353c3d' : color} />
            </mesh>
            {longEars && (
              <mesh scale={[1, 2.6, 0.6]}>
                <sphereGeometry args={[0.07, 10, 8]} />
                <meshStandardMaterial color={color} />
              </mesh>
            )}
          </group>
        ))}
        <mesh position={[0, -0.06, 0.195]} scale={[1.15, 0.68, 0.85]}>
          <sphereGeometry args={[0.125, 12, 8]} />
          <meshStandardMaterial color="#f1dfc6" roughness={0.9} />
        </mesh>
        {[-1, 1].map((side) => (
          <group key={side} position={[side * 0.105, 0.035, 0.2]}>
            {(agent.species === 'panda' || agent.species === 'raccoon') && (
              <mesh position={[0, 0, -0.008]} scale={[1.3, 1, 0.35]}>
                <sphereGeometry args={[0.07, 10, 8]} />
                <meshStandardMaterial color="#364144" />
              </mesh>
            )}
            <mesh>
              <sphereGeometry args={[0.026, 10, 8]} />
              <meshStandardMaterial color="#121e26" roughness={0.25} />
            </mesh>
            <mesh position={[-0.007, 0.009, 0.018]}>
              <sphereGeometry args={[0.008, 6, 6]} />
              <meshBasicMaterial color="white" />
            </mesh>
          </group>
        ))}
        <mesh position={[0, -0.035, 0.288]}>
          <sphereGeometry args={[0.027, 8, 8]} />
          <meshStandardMaterial color="#26383b" />
        </mesh>
      </group>
      <group ref={arms}>
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh position={[side * 0.2, 0.86, 0.18]} rotation={[0.85, 0, side * 0.2]} castShadow>
              <capsuleGeometry args={[0.067, 0.24, 4, 10]} />
              <meshStandardMaterial color={agent.color} />
            </mesh>
            <mesh position={[side * 0.2, 0.82, 0.35]}>
              <sphereGeometry args={[0.071, 10, 8]} />
              <meshStandardMaterial color={color} />
            </mesh>
            <mesh position={[side * 0.1, 0.48, 0.11]} rotation={[0.75, 0, 0]} castShadow>
              <capsuleGeometry args={[0.076, 0.21, 4, 10]} />
              <meshStandardMaterial color="#344751" />
            </mesh>
            <mesh position={[side * 0.1, 0.23, 0.21]} scale={[1, 0.65, 1.5]} castShadow>
              <sphereGeometry args={[0.088, 10, 8]} />
              <meshStandardMaterial color="#d9dfd9" />
            </mesh>
          </group>
        ))}
      </group>
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.045, 0]}>
          <ringGeometry args={[0.45, 0.49, 40]} />
          <meshBasicMaterial color="#56d8dc" transparent opacity={0.9} />
        </mesh>
      )}
    </group>
  );
}
