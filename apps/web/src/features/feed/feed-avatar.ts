import type { AvatarState } from '../../avatar/state.js';
import type { FeedBucket } from './feed-model.js';

export const FEED_AVATAR_STATE: Record<FeedBucket, AvatarState> = {
  needs: 'needs',
  working: 'working',
  finished: 'finished',
  idle: 'idle',
};
