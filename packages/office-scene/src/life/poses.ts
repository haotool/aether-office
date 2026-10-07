import type { PoseRequest } from '../pose-cues.js';
import { EACH_DESK_MAX } from './place.js';
import type { LifeRule } from './registry.js';
import type { LifeCue } from './schedule.js';

/** A pose to ask for `delayMs` after the effect started. */
export type PoseCall = { delayMs: number; request: PoseRequest };

/**
 * The poses an effect asks of the members it stands over: its desk's member, the members of its group, or the members at
 * the desks in view (the same few the effect dresses). Pure; the pose registry decides whether each one plays.
 */
export function poseCalls(
  rule: LifeRule,
  cue: LifeCue,
  inView: readonly string[],
): readonly PoseCall[] {
  const pose = rule.pose;
  if (!pose) return [];
  const members =
    rule.anchor === 'desk'
      ? cue.member
        ? [cue.member]
        : []
      : rule.anchor === 'group'
        ? cue.group
        : inView.slice(0, EACH_DESK_MAX);
  return members.map((member) => ({
    delayMs: pose.atMs,
    request:
      'clip' in pose
        ? { member, source: 'life', clip: pose.clip }
        : { member, source: 'life', turn: { yaw: pose.turn, holdMs: pose.holdMs } },
  }));
}
