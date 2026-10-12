export const flags = (argv: string[]) => {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === undefined || !token.startsWith('--')) continue;
    const next = argv[i + 1];
    out[token.slice(2)] = next === undefined || next.startsWith('--') ? true : next;
  }
  return out;
};
