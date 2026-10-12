// Startup output (banner, pairing code) goes to the terminal, not into the request log. Messages never carry secrets
// other than the one-time pairing code the person asked for.
export const print = (line: string): void => void process.stdout.write(`${line}\n`);
export const warn = (line: string): void => void process.stderr.write(`${line}\n`);
