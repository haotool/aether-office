// What the control process tells the person who started it (the start-up banner, the pairing code) goes to the terminal,
// not into the request log. This is the one place that writes there; messages never carry secrets other than the
// one-time pairing code the person asked for.
export const print = (line: string): void => void process.stdout.write(`${line}\n`);
