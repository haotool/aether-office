import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  AnimationMixer,
  LoopOnce,
  LoopRepeat,
  MeshStandardMaterial,
  SkinnedMesh,
  type AnimationAction,
  type AnimationClip,
  type Object3D,
} from 'three';
import type { Agent } from '@aether/contracts';
import { acquireAnimal } from './animal-assets.js';
import { Zzz } from './Zzz.js';
import {
  APPARITION_CLIP,
  APPARITION_MODEL,
  BASE_CLIP,
  fidgetDelayMs,
  fidgetFor,
  greets,
  type Apparition,
  startPhase,
  transitionClip,
  type ClipName,
} from './animal-states.js';
const FADE_SECONDS = 0.35;
type Model = { scene: Object3D; clips: AnimationClip[]; url: string };
export function Animal({
  agent,
  selected,
  reducedMotion,
  quality,
  apparition,
  onError,
}: {
  agent: Agent;
  apparition?: Apparition | undefined;
  selected: boolean;
  reducedMotion: boolean;
  quality: 'low' | 'balanced' | 'high';
  onError: () => void;
}) {
  const lod = quality === 'low' ? 2 : selected ? 0 : 1;
  const species = apparition ? APPARITION_MODEL[apparition] : agent.species;
  const url = `/assets/animals/${species}-lod${lod}.glb`;
  const [model, setModel] = useState<Model | null>(null);
  const mixer = useRef<AnimationMixer | null>(null);
  const invalidate = useThree((s) => s.invalidate);
  const fail = useEffectEvent(onError);
  // One-shots (a gesture, a cheer, a greeting) play over the base clip of the activity, then hand back to it.
  const [oneShot, setOneShot] = useState<ClipName | null>(null);
  const current = useRef<AnimationAction | null>(null);
  const lastActivity = useRef<typeof agent.activity | null>(null);
  const gestures = useRef(0);
  const clip = apparition ? APPARITION_CLIP[apparition] : (oneShot ?? BASE_CLIP[agent.activity]);
  const greet = useEffectEvent(() => {
    if (!reducedMotion && !apparition && greets(agent.activity)) setOneShot('wave');
  });
  useEffect(() => {
    const mark = transitionClip(lastActivity.current, agent.activity);
    lastActivity.current = agent.activity;
    setOneShot(reducedMotion || apparition ? null : mark);
  }, [agent.activity, reducedMotion, apparition]);
  useEffect(() => {
    if (selected) greet();
  }, [selected]);
  useEffect(() => {
    if (!model || reducedMotion || apparition || oneShot || !fidgetFor(agent.activity, agent.id, 0))
      return;
    const n = gestures.current;
    const timer = setTimeout(
      () => {
        gestures.current = n + 1;
        setOneShot(fidgetFor(agent.activity, agent.id, n));
      },
      fidgetDelayMs(agent.id, n),
    );
    return () => clearTimeout(timer);
  }, [model, reducedMotion, apparition, oneShot, agent.activity, agent.id]);
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
            if (species === 'ghost') ghostly(node);
          }
        });
        mixer.current = new AnimationMixer(loaded.scene);
        mixer.current.addEventListener('finished', () => setOneShot(null));
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
      current.current = null;
      asset.release();
    };
  }, [url, species, invalidate]);
  useEffect(() => {
    if (!model || model.url !== url || !mixer.current) return;
    const animation = model.clips.find((action) => action.name === clip);
    if (!animation) {
      fail();
      return;
    }
    const player = mixer.current;
    const next = player.clipAction(animation);
    const once = oneShot !== null;
    const previous = current.current;
    next.reset().setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = false;
    if (previous && previous !== next && !reducedMotion) {
      next.fadeIn(FADE_SECONDS).play();
      previous.fadeOut(FADE_SECONDS);
    } else {
      previous?.stop();
      next.play();
    }
    next.time = reducedMotion || once ? 0 : startPhase(agent.id) * animation.duration;
    player.update(0);
    current.current = next;
    invalidate();
  }, [model, url, clip, oneShot, reducedMotion, agent.id, invalidate]);
  useFrame((_state, delta) => {
    if (mixer.current && !reducedMotion && !document.hidden)
      mixer.current.update(Math.min(delta, 0.05));
  });
  // Where each apparition stands: a ghost floats just over its seat, a jiangshi stands behind the chair, a sleeping
  // rabbit sits where the member does.
  const offset: [number, number, number] =
    apparition === 'ghost' ? [0, 0.18, 0] : apparition === 'zombie' ? [0, 0, 0.95] : [0, 0, 0];
  return (
    <group position={offset}>
      <group rotation={[0, Math.PI, 0]}>
        {model?.url === url && <primitive object={model.scene} dispose={null} />}
        {selected && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
            <ringGeometry args={[0.46, 0.5, 40]} />
            <meshBasicMaterial color="#67d3d0" />
          </mesh>
        )}
      </group>
      {apparition === 'sleeping_rabbit' && (
        <group position={[0, 1.55, -0.25]}>
          <Zzz reducedMotion={reducedMotion} />
        </group>
      )}
    </group>
  );
}

/** A ghost is see-through and faintly lit from within; everything else about it is its model. */
function ghostly(mesh: SkinnedMesh): void {
  for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
    if (!(material instanceof MeshStandardMaterial)) continue;
    material.transparent = true;
    material.opacity = 0.62;
    material.depthWrite = false;
    // The glow follows the texture, so the dark hollows of the face stay dark.
    material.emissive.set('#8fb4ff');
    material.emissiveMap = material.map;
    material.emissiveIntensity = 0.7;
    material.needsUpdate = true;
  }
}
