import { afterAll, beforeEach, expect, it } from 'vitest';
import { seeded } from '../../packages/office-scene/src/seeded.js';
import { buildFloor } from '../../packages/office-scene/src/building.js';
import { deskItemsGeometry } from '../../packages/office-scene/src/desk-items.js';
import { chooseShot } from '../../packages/office-scene/src/director.js';
import { genomeOf } from '../../packages/office-scene/src/flower-genome.js';
import { gardenOf } from '../../packages/office-scene/src/garden-geometry.js';
import { defaultLayout } from '../../packages/office-scene/src/layout.js';
import { emptyLifeState, schedule } from '../../packages/office-scene/src/life/schedule.js';
import { chooseFeeds } from '../../packages/office-scene/src/multi-view.js';
import { currentWork } from '../../packages/office-scene/src/screen-layout.js';
import { PALETTES } from '../../packages/office-scene/src/screen-theme.js';
import { VIEWS } from '../../packages/office-scene/src/screen-views.js';
import { chooseEntry, poseAt } from '../../packages/office-scene/src/shot-camera.js';
import { EMPTY_SQUAD, stepSquad } from '../../packages/office-scene/src/squad/squad-model.js';
import { layoutStalk } from '../../packages/office-scene/src/stalk-layout.js';
import { installBrowserEnv, installGlobal, removeBrowserEnv } from './fixtures/browser-env.js';
import { recordingContext } from './fixtures/recording-canvas.js';
import { runScenarios } from './fixtures/scene-scenarios.js';

// The scene's pure modules, run over fixed seeded inputs and reduced to digests. The digests were taken from the code as it
// stood before its functions were split into named steps: a refactor keeps them, a change of behaviour does not. When a
// change of behaviour is meant, regenerate them by running this test and copying the digests it prints.
installBrowserEnv();
beforeEach(() => {
  installGlobal('Path2D', class {});
  installGlobal('document', {
    createElement: () => {
      const { g } = recordingContext();
      return { width: 0, height: 0, getContext: () => g };
    },
  });
});
afterAll(removeBrowserEnv);

const EXPECTED: Record<string, string> = {
  genomes: '8a633fee9ccf07bb',
  stalks: '5964a3e52c7fd6a4',
  directing: '3fafc5d0d5fabcab',
  squads: '87ac462f58344d9d',
  layouts: '8cdd4afcdfad6fbf',
  deskItems: '37a32b6fc2afe27c',
  screens: '58d662ed2dc10349',
  lifeSchedule: '83f69b24eac33b4b',
};

it('keeps every scene module producing what it produced', () => {
  const digests = runScenarios({
    seeded,
    genome: { genomeOf },
    stalk: { layoutStalk },
    garden: { gardenOf },
    director: { chooseShot },
    camera: { poseAt, chooseEntry },
    multi: { chooseFeeds },
    squad: { stepSquad, EMPTY_SQUAD },
    layout: { defaultLayout },
    building: { buildFloor },
    items: { deskItemsGeometry },
    views: { VIEWS },
    theme: { PALETTES },
    screenLayout: { currentWork },
    schedule: { schedule, emptyLifeState },
  });
  expect(digests).toEqual(EXPECTED);
}, 120_000);
