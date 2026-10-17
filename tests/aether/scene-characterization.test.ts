import { afterAll, beforeEach, expect, it } from 'vitest';
import { seeded } from '../../packages/office-scene/src/environment/seeded.js';
import { buildFloor } from '../../packages/office-scene/src/environment/building.js';
import { deskItemsGeometry } from '../../packages/office-scene/src/desks/desk-items.js';
import { chooseShot } from '../../packages/office-scene/src/environment/director.js';
import { genomeOf } from '../../packages/office-scene/src/flowers/flower-genome.js';
import { gardenOf } from '../../packages/office-scene/src/core/garden-geometry.js';
import { defaultLayout } from '../../packages/office-scene/src/environment/layout.js';
import { emptyLifeState, schedule } from '../../packages/office-scene/src/life/schedule.js';
import { chooseFeeds } from '../../packages/office-scene/src/core/multi-view.js';
import { currentWork } from '../../packages/office-scene/src/screen/screen-layout.js';
import { PALETTES } from '../../packages/office-scene/src/screen/screen-theme.js';
import { VIEWS } from '../../packages/office-scene/src/screen/screen-views.js';
import { chooseEntry, poseAt } from '../../packages/office-scene/src/core/shot-camera.js';
import { EMPTY_SQUAD, stepSquad } from '../../packages/office-scene/src/squad/squad-model.js';
import { layoutStalk } from '../../packages/office-scene/src/core/stalk-layout.js';
import { installBrowserEnv, installGlobal, removeBrowserEnv } from './fixtures/browser-env.js';
import { recordingContext } from './fixtures/recording-canvas.js';
import { runScenarios } from './fixtures/scene-scenarios.js';

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
  directing: 'b5e2725d4c4a5007',
  squads: '87ac462f58344d9d',
  layouts: 'a4599fe1f5fdedae',
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
