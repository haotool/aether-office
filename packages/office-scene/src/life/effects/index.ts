import { ciLamp, installHole } from './checks.js';
import { konami, standUp, techDebt } from './crowd.js';
import { curlPipe, forcePush, mergeConflict, skullGag, sudoPrompt } from './danger.js';
import { pager, shipIt } from './launch.js';
import { stickyNotes, timeMachine } from './notes.js';
import { ctrlCv, retryLoop, vimTrap } from './memes.js';
import { fridayDeploy, launchPad, lgtm } from './ops.js';
import { buildError, ciFail, ciPass, ciStack, notABug, worksMachine } from './outcomes.js';
import type { Effect } from './types.js';
import { coffeeRefill, rubberDuck } from './wellbeing.js';

export type EffectId =
  | 'rubber-duck'
  | 'ci-lamp'
  | 'install-hole'
  | 'ship-it'
  | 'pager'
  | 'coffee-refill'
  | 'retry-loop'
  | 'ctrl-cv'
  | 'vim-trap'
  | 'tech-debt'
  | 'standup'
  | 'konami'
  | 'ci-pass'
  | 'ci-fail'
  | 'ci-stack'
  | 'build-error'
  | 'force-push'
  | 'merge-conflict'
  | 'launch-pad'
  | 'friday-deploy'
  | 'skull-gag'
  | 'works-machine'
  | 'not-a-bug'
  | 'lgtm'
  | 'sudo-prompt'
  | 'curl-pipe'
  | 'time-machine'
  | 'todo-notes';

/** Every effect's timeline by id. The registry (../registry.ts) says when each one fires; this says what it looks like. */
export const EFFECTS: Readonly<Record<EffectId, Effect>> = {
  'rubber-duck': rubberDuck,
  'ci-lamp': ciLamp,
  'install-hole': installHole,
  'ship-it': shipIt,
  pager,
  'coffee-refill': coffeeRefill,
  'retry-loop': retryLoop,
  'ctrl-cv': ctrlCv,
  'vim-trap': vimTrap,
  'tech-debt': techDebt,
  standup: standUp,
  konami,
  'ci-pass': ciPass,
  'ci-fail': ciFail,
  'ci-stack': ciStack,
  'build-error': buildError,
  'force-push': forcePush,
  'merge-conflict': mergeConflict,
  'launch-pad': launchPad,
  'friday-deploy': fridayDeploy,
  'skull-gag': skullGag,
  'works-machine': worksMachine,
  'not-a-bug': notABug,
  lgtm,
  'sudo-prompt': sudoPrompt,
  'curl-pipe': curlPipe,
  'time-machine': timeMachine,
  'todo-notes': stickyNotes,
};

export const EFFECT_IDS = Object.keys(EFFECTS) as EffectId[];
export { CELLS, type CellId, type Effect, type Sprite } from './types.js';
