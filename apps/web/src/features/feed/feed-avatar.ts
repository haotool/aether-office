import type { AvatarState } from '../../avatar/state.js';
import type { FeedBucket } from './feed-model.js';

/** A feed row's bucket is how the portrait looks: asking, busy, done, or at rest. */
export const FEED_AVATAR_STATE: Record<FeedBucket, AvatarState> = {
  needs: 'needs',
  working: 'working',
  finished: 'finished',
  idle: 'idle',
};
