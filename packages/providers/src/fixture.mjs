// Synthetic provider process. It never runs a model or claims to have modified a repository.
import { createInterface } from 'node:readline';
const lines = createInterface({ input: process.stdin, terminal: false });
for await (const line of lines) {
  if (Buffer.byteLength(line) > 65536) process.exit(2);
  const command = JSON.parse(line);
  if (command.mode !== 'demo' || command.provider !== 'demo') process.exit(3);
  process.stdout.write(
    JSON.stringify({
      type: 'activity',
      activity: 'working',
      summary: 'DEMO fixture process received the assigned work.',
    }) + '\n',
  );
  process.stdout.write(
    JSON.stringify({
      type: 'result',
      outcome: 'submitted',
      summary: `DEMO · ${String(command.prompt).split('\n')[0]}\nA deterministic fixture process handled this assignment. No paid model ran and no repository change was produced. Human review and commit-bound verification remain required.`,
    }) + '\n',
  );
  lines.close();
  break;
}
