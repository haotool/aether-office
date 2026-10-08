import { useRef, useState } from 'react';
import type { AnimationAction, AnimationMixer, Group } from 'three';
import type { Agent } from '@aether/contracts';
import { Zzz } from './Zzz.js';
import type { BehaviorScene } from './use-micro-actions.js';
import {
  useAnimalModel,
  useClipPlayer,
  useMixerUpdates,
  useOneShots,
  type EmoteCue,
  type Model,
} from './animal-hooks.js';
import {
  APPARITION_CLIP,
  APPARITION_MODEL,
  BASE_CLIP,
  type Apparition,
  type ClipName,
} from './animal-states.js';

export type { EmoteCue } from './animal-hooks.js';
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

export type AnimalProps = {
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
};

/** Where each apparition stands: a ghost floats just over its seat, a jiangshi stands behind the chair, a sleeping rabbit sits where the member does. */
const offsetOf = (apparition: Apparition | undefined): [number, number, number] =>
  apparition === 'ghost' ? [0, 0.18, 0] : apparition === 'zombie' ? [0, 0, 0.95] : [0, 0, 0];

/** The character's model for its species and level of detail, with its one-shots, clip and mixer. */
function useAnimalRig(props: AnimalProps, ring: Ring | null) {
  const { agent, selected, emote, reducedMotion, quality, apparition, override, onError } = props;
  const { light = false, behavior = CALM } = props;
  const lod = quality === 'low' ? 2 : ring ? (light ? 1 : 0) : light ? 2 : 1;
  const species = apparition ? APPARITION_MODEL[apparition] : agent.species;
  const url = `/assets/animals/${species}-lod${lod}.glb`;
  const [model, setModel] = useState<Model | null>(null);
  const [oneShot, setOneShot] = useState<ClipName | null>(null);
  const mixer = useRef<AnimationMixer | null>(null);
  const current = useRef<AnimationAction | null>(null);
  const held = apparition ?? override; // something other than the activity decides what the member does
  const clip = apparition
    ? APPARITION_CLIP[apparition]
    : (override ?? oneShot ?? BASE_CLIP[agent.activity]);
  const shared = { reducedMotion, mixer, current, onError };
  useOneShots({
    agent,
    held,
    reducedMotion,
    selected,
    emote,
    model,
    oneShot,
    setOneShot,
    behavior,
  });
  useAnimalModel({ agent, url, species, light, setModel, setOneShot, ...shared });
  useClipPlayer({ model, url, clip, oneShot, apparition, override, agentId: agent.id, ...shared });
  return { model, url, mixer };
}

export function Animal(props: AnimalProps) {
  const { selected, reducedMotion, apparition, pace = 1 } = props;
  const ring = props.ring === undefined ? (selected ? 'selected' : null) : props.ring;
  const { model, url, mixer } = useAnimalRig(props, ring);
  const root = useRef<Group>(null);
  useMixerUpdates(mixer, root, { reducedMotion, selected, pace });
  return (
    <group ref={root} position={offsetOf(apparition)}>
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
