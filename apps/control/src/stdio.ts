// Startup output (banner, pairing code) goes to the terminal, not into the request log. Messages never carry secrets
// other than the one-time pairing code the person asked for.
export const print = (line: string): void => void process.stdout.write(`${line}\n`);
export const warn = (line: string): void => void process.stderr.write(`${line}\n`);

/** The English or the Traditional Chinese text: zh when AETHER_LANG, LC_ALL, LC_MESSAGES or LANG (first one set) starts with zh. */
export const say = (en: string, zhTW: string): string =>
  /^zh/i.test(
    process.env['AETHER_LANG'] ||
      process.env['LC_ALL'] ||
      process.env['LC_MESSAGES'] ||
      process.env['LANG'] ||
      '',
  )
    ? zhTW
    : en;
