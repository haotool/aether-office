import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { AnimationMixer, LoopRepeat, SkinnedMesh, type Object3D, type AnimationClip } from 'three';
import type { Agent } from '@aether/contracts';
import { acquireAnimal } from './animal-assets.js';
type Model = { scene: Object3D; clips: AnimationClip[]; url: string };
export function Animal({
  agent,
  selected,
  reducedMotion,
  quality,
  onError,
}: {
  agent: Agent;
  selected: boolean;
  reducedMotion: boolean;
  quality: 'low' | 'balanced' | 'high';
  onError: () => void;
}) {
  const lod = quality === 'low' ? 2 : selected ? 0 : 1;
  const url = `/assets/animals/${agent.species}-lod${lod}.glb`;
  const [model, setModel] = useState<Model | null>(null);
  const mixer = useRef<AnimationMixer | null>(null);
  const invalidate = useThree((s) => s.invalidate);
  const fail = useEffectEvent(onError);
  const clip =
    agent.activity === 'working'
      ? 'typing'
      : agent.activity === 'reviewing'
        ? 'reviewing'
        : agent.activity === 'waiting_permission'
          ? 'waiting_permission'
          : agent.activity === 'waiting_peer'
            ? 'waiting_peer'
            : agent.activity === 'error'
              ? 'error'
              : 'seated_idle';
  useEffect(() => {
    const asset = acquireAnimal(url);
    let disposed = false;
    let instance: Model | null = null;
    void asset
      .load()
      .then((loaded) => {
        if (!loaded || disposed) return;
        instance = { ...loaded, url };
        loaded.scene.traverse((node) => {
          if (node instanceof SkinnedMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
          }
        });
        mixer.current = new AnimationMixer(loaded.scene);
        setModel(instance);
        invalidate();
      })
      .catch(() => {
        if (!disposed) fail();
      });
    return () => {
      disposed = true;
      mixer.current?.stopAllAction();
      if (instance) {
        mixer.current?.uncacheRoot(instance.scene);
        instance.scene.traverse((node) => {
          if (node instanceof SkinnedMesh) node.skeleton.dispose();
        });
      }
      mixer.current = null;
      asset.release();
    };
  }, [url, invalidate]);
  useEffect(() => {
    if (!model || model.url !== url || !mixer.current) return;
    const animation = model.clips.find((action) => action.name === clip);
    if (!animation) {
      fail();
      return;
    }
    mixer.current.stopAllAction();
    mixer.current.clipAction(animation).reset().setLoop(LoopRepeat, Infinity).play();
    mixer.current.setTime(0);
    invalidate();
  }, [model, url, clip, invalidate]);
  useFrame((_state, delta) => {
    if (
      mixer.current &&
      !reducedMotion &&
      !document.hidden &&
      !['offline', 'unknown'].includes(agent.activity)
    )
      mixer.current.update(Math.min(delta, 0.05));
  });
  return (
    <group rotation={[0, Math.PI, 0]}>
      {model?.url === url && <primitive object={model.scene} dispose={null} />}{' '}
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
          <ringGeometry args={[0.46, 0.5, 40]} />
          <meshBasicMaterial color="#67d3d0" />
        </mesh>
      )}
    </group>
  );
}
