// The runner has no HTTP server and so no request logger: what it tells its operator goes to the terminal it was started
// from. This is the one place that writes there (messages carry codes and counts, never secrets or payloads).
export const print = (line: string): void => void process.stdout.write(`${line}\n`);
export const warn = (line: string): void => void process.stderr.write(`${line}\n`);
