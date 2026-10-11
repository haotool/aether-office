import {
  useEffect,
  useEffectEvent,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  AnimationMixer,
  LoopOnce,
  LoopRepeat,
  SkinnedMesh,
  type AnimationAction,
  type AnimationClip,
  type Group,
  type Object3D,
  Vector3,
} from 'three';
import type { Agent } from '@aether/contracts';
import { acquireAnimal } from './animal-assets.js';
import { ghostly, rimLit } from './animal-materials.js';
import { registerAnchors } from '../squad/puppet/anchors.js';
import { animationInterval } from '../perf/perf-control.js';
import { useMicroActions, type BehaviorScene } from '../core/use-micro-actions.js';
import {
  greets,
  startPhase,
  transitionClip,
  type Apparition,
  type ClipName,
} from './animal-states.js';

const FADE_SECONDS = 0.35;
export type Model = { scene: Object3D; clips: AnimationClip[]; url: string };
export type EmoteCue = { clip: ClipName; key: number };

type SetOneShot = Dispatch<SetStateAction<ClipName | null>>;

export function useOneShots(o: {
  agent: Agent;
  held: Apparition | ClipName | undefined;
  reducedMotion: boolean;
  selected: boolean;
  emote: EmoteCue | undefined;
  model: Model | null;
  oneShot: ClipName | null;
  setOneShot: SetOneShot;
  behavior: BehaviorScene;
}) {
  const { agent, held, reducedMotion, selected, emote, model, oneShot, setOneShot } = o;
  const lastActivity = useRef<typeof agent.activity | null>(null);
  const greet = useEffectEvent(() => {
    if (!reducedMotion && !held && greets(agent.activity)) setOneShot('wave');
  });
  useEffect(() => {
    const mark = transitionClip(lastActivity.current, agent.activity);
    lastActivity.current = agent.activity;
    setOneShot(reducedMotion || held ? null : mark);
  }, [agent.activity, reducedMotion, held, setOneShot]);
  useEffect(() => {
    if (selected) greet();
  }, [selected]);
  const react = useEffectEvent(() => {
    if (emote && !reducedMotion && !held && model) setOneShot(emote.clip);
  });
  const emoteKey = emote?.key;
  useEffect(() => {
    if (emoteKey !== undefined) react();
  }, [emoteKey]);
  useMicroActions({
    enabled: model !== null && !reducedMotion && !held,
    busy: oneShot !== null,
    activity: agent.activity,
    seed: agent.id,
    species: agent.species,
    scene: o.behavior,
    play: setOneShot,
  });
}

type AnimalModelOptions = {
  agent: Agent;
  url: string;
  species: string;
  light: boolean;
  setModel: Dispatch<SetStateAction<Model | null>>;
  setOneShot: SetOneShot;
  mixer: RefObject<AnimationMixer | null>;
  current: RefObject<AnimationAction | null>;
  onError: () => void;
};

function styleCharacter(scene: Object3D, species: string, light: boolean) {
  scene.traverse((node) => {
    if (!(node instanceof SkinnedMesh)) return;
    node.castShadow = true;
    node.receiveShadow = true;
    if (species === 'ghost') ghostly(node);
    else if (!light) rimLit(node);
  });
}

export function useAnimalModel(o: AnimalModelOptions) {
  const { agent, url, species, light, setModel, setOneShot, mixer, current } = o;
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  const stage = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const fail = useEffectEvent(o.onError);
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
        styleCharacter(loaded.scene, species, light);
        mixer.current = new AnimationMixer(loaded.scene);
        mixer.current.addEventListener('finished', () => setOneShot(null));
        forgetAnchors = registerAnchors(agent.id, loaded.scene);
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
    // `agent.id` only labels the anchors, and the seat a model serves never changes under a mounted member.
  }, [url, species, light, invalidate, gl, camera, stage]);
}

export function useClipPlayer(o: {
  model: Model | null;
  url: string;
  clip: string;
  oneShot: ClipName | null;
  apparition: Apparition | undefined;
  override: ClipName | undefined;
  reducedMotion: boolean;
  agentId: string;
  mixer: RefObject<AnimationMixer | null>;
  current: RefObject<AnimationAction | null>;
  onError: () => void;
}) {
  const { model, url, clip, oneShot, apparition, override, reducedMotion, agentId } = o;
  const invalidate = useThree((s) => s.invalidate);
  const fail = useEffectEvent(o.onError);
  useEffect(() => {
    if (!model || model.url !== url || !o.mixer.current) return;
    const animation = model.clips.find((action) => action.name === clip);
    if (!animation) {
      fail();
      return;
    }
    const player = o.mixer.current;
    const next = player.clipAction(animation);
    const once =
      oneShot !== null || (!apparition && (override === 'stand_up' || override === 'wave'));
    const previous = o.current.current;
    next.reset().setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once && oneShot === null;
    if (previous && previous !== next && !reducedMotion) {
      next.fadeIn(FADE_SECONDS).play();
      previous.fadeOut(FADE_SECONDS);
    } else {
      previous?.stop();
      next.play();
    }
    next.time = reducedMotion || once ? 0 : startPhase(agentId) * animation.duration;
    player.update(0);
    o.current.current = next;
    invalidate();
  }, [model, url, clip, oneShot, apparition, override, reducedMotion, agentId, invalidate]);
}

export function useMixerUpdates(
  mixer: RefObject<AnimationMixer | null>,
  root: RefObject<Group | null>,
  { reducedMotion, selected, pace }: { reducedMotion: boolean; selected: boolean; pace: number },
) {
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
}
