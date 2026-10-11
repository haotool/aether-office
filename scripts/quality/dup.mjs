const WINDOW = 50;
const MIN_LINES = 6;
const TOKEN =
  /\/\/[^\n]*|\/\*[\s\S]*?\*\/|`(?:\\[\s\S]|[^`\\])*`|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|[A-Za-z_$][\w$]*|\d[\w.]*|=>|[=!]==?|&&|\|\||\?\?|\S|\n/g;

export function tokenize(text) {
  const tokens = [];
  let line = 1;
  let lineStart = true;
  let inImport = false;
  for (const match of text.matchAll(TOKEN)) {
    const t = match[0];
    if (t === '\n') {
      line++;
      lineStart = true;
    } else if (t.startsWith('//')) continue;
    else if (t.startsWith('/*')) line += t.split('\n').length - 1;
    else {
      if (lineStart && t === 'import') inImport = true;
      lineStart = false;
      if (inImport) inImport = !/^['"]/.test(t);
      else tokens.push({ t, line });
      if (t.startsWith('`')) line += t.split('\n').length - 1;
    }
  }
  return tokens;
}

const mix = (h, id, m) => Math.imul(h ^ id, m) >>> 0;

export function findDuplicates(sources) {
  const ids = new Map();
  const perFile = sources.map(({ file, text }) => {
    const tokens = tokenize(text);
    const codes = tokens.map(({ t }) => {
      if (!ids.has(t)) ids.set(t, ids.size + 1);
      return ids.get(t);
    });
    return { file, tokens, codes };
  });
  const seen = new Map();
  const hashes = perFile.map(({ codes }) => {
    const out = new Array(Math.max(0, codes.length - WINDOW + 1));
    for (let i = 0; i < out.length; i++) {
      let a = 2166136261;
      let b = 5381;
      for (let k = i; k < i + WINDOW; k++) {
        a = mix(a, codes[k], 16777619);
        b = mix(b, codes[k], 2246822519);
      }
      out[i] = a * 2097152 + (b >>> 11);
    }
    return out;
  });
  for (const list of hashes) for (const h of list) seen.set(h, (seen.get(h) ?? 0) + 1);
  const covered = perFile.map(({ codes }) => new Uint8Array(codes.length));
  hashes.forEach((list, f) =>
    list.forEach((h, i) => {
      if (seen.get(h) > 1) covered[f].fill(1, i, i + WINDOW);
    }),
  );
  const groups = new Map();
  perFile.forEach(({ file, tokens }, f) => {
    let i = 0;
    while (i < tokens.length) {
      if (!covered[f][i]) {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < tokens.length && covered[f][j + 1]) j++;
      const from = tokens[i].line;
      const to = tokens[j].line;
      const key = hashes[f][i] ?? `${f}:${i}`;
      if (to - from + 1 >= MIN_LINES) {
        const copies = groups.get(key) ?? [];
        copies.push({ file, from, to });
        groups.set(key, copies);
      }
      i = j + 1;
    }
  });
  const lines = new Set();
  const clusters = [];
  for (const copies of groups.values()) {
    if (copies.length < 2) continue;
    for (const c of copies) for (let l = c.from; l <= c.to; l++) lines.add(`${c.file}:${l}`);
    const size = Math.max(...copies.map((c) => c.to - c.from + 1));
    clusters.push({ lines: size, saves: size * (copies.length - 1), copies });
  }
  clusters.sort((a, b) => b.saves - a.saves || a.copies[0].file.localeCompare(b.copies[0].file));
  const totalLines = sources.reduce((n, { text }) => n + text.split('\n').length, 0);
  return { duplicatedLines: lines.size, totalLines, clusters };
}
