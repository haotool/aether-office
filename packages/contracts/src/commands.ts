import { z } from 'zod';
import { workbenchCommands } from './command-workbench.js';
import { collabCommands } from './command-collab.js';
import { opsCommands } from './command-ops.js';

export const commandSchema = z.discriminatedUnion('type', [
  ...workbenchCommands,
  ...collabCommands,
  ...opsCommands,
]);
export type Command = z.infer<typeof commandSchema>;
