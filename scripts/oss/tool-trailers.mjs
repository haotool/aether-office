import { readFileSync } from 'node:fs';
import { hasToolTrailers } from './git-messages.mjs';

// Reads commit messages from a file or stdin (NUL-separated) and fails on any AI-tool trailer.
const messages = readFileSync(process.argv[2] ?? 0, 'utf8').split('\0');
const bad = messages.filter(hasToolTrailers).map((message) => message.trim().split('\n')[0]);
for (const subject of bad) console.error(`AI-tool trailer in the message of: ${subject}`);
process.exit(bad.length ? 1 : 0);
