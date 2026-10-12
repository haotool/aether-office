// A synthetic, labelled corpus of sessions: nothing here comes from a real session. Cases are written from how such
// work looks (file kinds, command families, branch names, subagent types), not from the classifier's own keyword lists.
import type { CorpusCase } from './corpus-types.js';
import { PRODUCT } from './corpus-product.js';
import { OPERATIONS } from './corpus-operations.js';
import { ASSURANCE } from './corpus-assurance.js';
import { PROCESS } from './corpus-process.js';

export const CORPUS: CorpusCase[] = [...PRODUCT, ...OPERATIONS, ...ASSURANCE, ...PROCESS];
