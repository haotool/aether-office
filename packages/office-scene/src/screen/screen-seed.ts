import { seeded, type Rng } from '../environment/seeded.js';
import type { ViewCtx } from './screen-theme.js';

export const memberRng = (seed: string, label: string): Rng => seeded(`${seed}:${label}`);

export const viewRng = (c: Pick<ViewCtx, 'seed'>, label: string): Rng => memberRng(c.seed, label);
