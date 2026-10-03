import { expect, it } from 'vitest';
import {
  TOUR_STOPS,
  idle,
  restoreFocus,
  tourFocus,
  tourReducer,
  type TourAction,
  type TourState,
} from '../../apps/web/src/tour.js';

const run = (actions: TourAction[], from: TourState = idle) =>
  actions.reduce((s, a) => tourReducer(s, a), from);

it('starts at the first stop, can pause and resume, and skip advances immediately', () => {
  let s = run([{ type: 'start', restore: 'overview' }]);
  expect(tourFocus(s)).toBe(TOUR_STOPS[0]);
  s = run([{ type: 'pause' }], s);
  expect(s.status).toBe('paused');
  expect(run([{ type: 'skip' }], s)).toMatchObject({ status: 'paused', index: 1 }); // skipping while paused stays paused
  expect(run([{ type: 'resume' }], s).status).toBe('playing');
  expect(run([{ type: 'resume' }]).status).toBe('idle'); // resume with nothing to resume is a no-op
});

it('ends after the last stop and restores the prior focus, but an interrupt leaves the camera alone', () => {
  const last = run(
    Array.from({ length: TOUR_STOPS.length - 1 }, () => ({ type: 'skip' }) as const),
    run([{ type: 'start', restore: 'atrium' }]),
  );
  expect(tourFocus(last)).toBe(TOUR_STOPS.at(-1));
  const ended = tourReducer(last, { type: 'skip' });
  expect(ended).toEqual(idle);
  expect(restoreFocus(last, { type: 'skip' }, ended)).toBe('atrium');

  const playing = run([{ type: 'start', restore: 'atrium' }]);
  const interrupted = tourReducer(playing, { type: 'interrupt' });
  expect(interrupted).toEqual(idle);
  expect(restoreFocus(playing, { type: 'interrupt' }, interrupted)).toBeNull();
  expect(restoreFocus(playing, { type: 'stop' }, tourReducer(playing, { type: 'stop' }))).toBe(
    'atrium',
  );
  expect(tourFocus(idle)).toBeNull();
});
