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
  Vector3,
  type Group,
  type Object3D,
} from 'three';
import type { Agent } from '@aether/contracts';
import { acquireAnimal } from './animal-assets.js';
import { Zzz } from './Zzz.js';
import { registerAnchors } from './squad/puppet/anchors.js';
import { animationInterval } from './perf-control.js';
import { useMicroActions, type BehaviorScene } from './use-micro-actions.js';
import {
  APPARITION_CLIP,
  APPARITION_MODEL,
  BASE_CLIP,
  greets,
  type Apparition,
  startPhase,
  transitionClip,
  type ClipName,
} from './animal-states.js';
const FADE_SECONDS = 0.35;
type Model = { scene: Object3D; clips: AnimationClip[]; url: string };
/** The ring on the floor under a character: chosen (cyan), hovered (white) or part of a group selection (gold). */
export type Ring = 'selected' | 'hover' | 'group';
const RING_COLOR: Record<Ring, string> = {
  selected: '#67d3d0',
  hover: '#ffffff',
  group: '#ffc65c',
};
const CALM: BehaviorScene = {
  mode: 'working',
  intensity: 0,
  secondMonitor: false,
  quietMinutes: null,
};
/** A reaction the person asked for: the clip plays once over what the member is doing; a new `key` plays it again. */
export type EmoteCue = { clip: ClipName; key: number };

export function Animal({
  agent,
  selected,
  ring = selected ? 'selected' : null,
  emote,
  reducedMotion,
  quality,
  apparition,
  override,
  pace = 1,
  light = false,
  behavior = CALM,
  onError,
}: {
  agent: Agent;
  apparition?: Apparition | undefined;
  /** A clip the member is held to whatever it is doing: stand_up and wave play once, the rest loop (a member leaving). */
  override?: ClipName | undefined;
  /** How fast the clips play: a member working flat out types faster. */
  pace?: number;
  /** What the director needs: the kind of work, the intensity, the second monitor (behavior.ts). */
  behavior?: BehaviorScene;
  /** A phone: smaller models and textures (the selected one a step down, the rest the smallest). */
  light?: boolean;
  selected: boolean;
  ring?: Ring | null;
  emote?: EmoteCue | undefined;
  reducedMotion: boolean;
  quality: 'low' | 'balanced' | 'high';
  onError: () => void;
}) {
  const lod = quality === 'low' ? 2 : ring ? (light ? 1 : 0) : light ? 2 : 1;
  const species = apparition ? APPARITION_MODEL[apparition] : agent.species;
  const url = `/assets/animals/${species}-lod${lod}.glb`;
  const [model, setModel] = useState<Model | null>(null);
  const mixer = useRef<AnimationMixer | null>(null);
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  const stage = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const fail = useEffectEvent(onError);
  // One-shots (a gesture, a cheer, a greeting) play over the base clip of the activity, then hand back to it.
  const [oneShot, setOneShot] = useState<ClipName | null>(null);
  const current = useRef<AnimationAction | null>(null);
  const lastActivity = useRef<typeof agent.activity | null>(null);
  const held = apparition ?? override; // something other than the activity decides what the member does
  const clip = apparition
    ? APPARITION_CLIP[apparition]
    : (override ?? oneShot ?? BASE_CLIP[agent.activity]);
  const greet = useEffectEvent(() => {
    if (!reducedMotion && !held && greets(agent.activity)) setOneShot('wave');
  });
  useEffect(() => {
    const mark = transitionClip(lastActivity.current, agent.activity);
    lastActivity.current = agent.activity;
    setOneShot(reducedMotion || held ? null : mark);
  }, [agent.activity, reducedMotion, held]);
  useEffect(() => {
    if (selected) greet();
  }, [selected]);
  const react = useEffectEvent((cue: EmoteCue) => {
    if (!reducedMotion && !held && model) setOneShot(cue.clip);
  });
  useEffect(() => {
    if (emote) react(emote);
  }, [emote?.key]); // eslint-disable-line react-hooks/exhaustive-deps -- one reaction per request, not per render
  useMicroActions({
    enabled: model !== null && !reducedMotion && !held,
    busy: oneShot !== null,
    activity: agent.activity,
    seed: agent.id,
    species: agent.species,
    scene: behavior,
    play: setOneShot,
  });
  useEffect(() => {
    const asset = acquireAnimal(url);
    let disposed = false;
    let instance: Model | null = null;
    let forgetAnchors: (() => void) | undefined;
    void asset
      .load()
      .then(async (loaded) => {
        if (!loaded || disposed) return;
        // Link the character's shaders in parallel before it appears, so its first frame does not stall on them.
        await gl.compileAsync(loaded.scene, camera, stage).catch(() => undefined);
        if (disposed) return;
        instance = { ...loaded, url };
        loaded.scene.traverse((node) => {
          if (node instanceof SkinnedMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
            if (species === 'ghost') ghostly(node);
            else if (!light) rimLit(node);
          }
        });
        mixer.current = new AnimationMixer(loaded.scene);
        mixer.current.addEventListener('finished', () => setOneShot(null));
        forgetAnchors = registerAnchors(agent.id, loaded.scene); // the squad's puppet strings tie to its head and hands
        setModel(instance);
        invalidate();
      })
      .catch(() => {
        if (!disposed) fail();
      });
    return () => {
      disposed = true;
      forgetAnchors?.();
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
  }, [url, species, light, invalidate, gl, camera, stage]);
  useEffect(() => {
    if (!model || model.url !== url || !mixer.current) return;
    const animation = model.clips.find((action) => action.name === clip);
    if (!animation) {
      fail();
      return;
    }
    const player = mixer.current;
    const next = player.clipAction(animation);
    const once =
      oneShot !== null || (!apparition && (override === 'stand_up' || override === 'wave'));
    const previous = current.current;
    next.reset().setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once && oneShot === null; // a held gesture ends in its last pose, not in the bind pose
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
  }, [model, url, clip, oneShot, apparition, override, reducedMotion, agent.id, invalidate]);
  // Far members are updated at a lower rate (see animationInterval); the time they skipped is applied in one step.
  const root = useRef<Group>(null);
  const here = useRef(new Vector3());
  const owed = useRef(0);
  useFrame(({ camera }, delta) => {
    if (!mixer.current || reducedMotion || document.hidden) return;
    owed.current += Math.min(delta, 0.05);
    const interval =
      selected || !root.current
        ? 0
        : animationInterval(
            camera.position.distanceTo(root.current.getWorldPosition(here.current)),
          );
    if (owed.current < interval) return;
    mixer.current.update(owed.current * pace);
    owed.current = 0;
  });
  // Where each apparition stands: a ghost floats just over its seat, a jiangshi stands behind the chair, a sleeping
  // rabbit sits where the member does.
  const offset: [number, number, number] =
    apparition === 'ghost' ? [0, 0.18, 0] : apparition === 'zombie' ? [0, 0, 0.95] : [0, 0, 0];
  return (
    <group ref={root} position={offset}>
      <group rotation={[0, Math.PI, 0]}>
        {model?.url === url && <primitive object={model.scene} dispose={null} />}
        {ring && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
            <ringGeometry args={ring === 'hover' ? [0.44, 0.52, 40] : [0.46, 0.5, 40]} />
            <meshBasicMaterial color={RING_COLOR[ring]} />
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

/**
 * A soft light along the edge a surface turns away from the eye, in the cool tone of the office, so a character stands
 * out from the dark floor and keeps its shape against the glow behind it. Skipped on a phone (one more term in every
 * pixel's shading) and for the ghost, which glows by itself.
 */
function rimLit(mesh: SkinnedMesh): void {
  for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
    if (!(material instanceof MeshStandardMaterial)) continue;
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float rim = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0), 3.0);
        totalEmissiveRadiance += vec3(0.42, 0.78, 0.9) * rim * 0.28;`,
      );
    };
    material.customProgramCacheKey = () => 'animal-rim';
    material.needsUpdate = true;
  }
}
