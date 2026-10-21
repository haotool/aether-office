// For commands shown to a person who will paste them into a shell: a path or ref may hold `$(…)`, `;` or quotes.
export const shQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
