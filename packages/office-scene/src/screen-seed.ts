import { seeded, type Rng } from './seeded.js';
import type { ViewCtx } from './screen-theme.js';

/** The generator of one made-up thing of one member: the same member and label always draw the same one. */
export const memberRng = (seed: string, label: string): Rng => seeded(`${seed}:${label}`);

/** The generator of one made-up picture of the member a view is drawn for. */
export const viewRng = (c: Pick<ViewCtx, 'seed'>, label: string): Rng => memberRng(c.seed, label);
