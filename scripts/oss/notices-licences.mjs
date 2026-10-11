import { createHash } from 'node:crypto';
import { ALLOWED, ALLOWED_EXCEPTIONS, CONDITIONAL, DENIED } from './notices-policy.mjs';

export function parseSpdx(expression) {
  const tokens = expression.match(/\(|\)|[^\s()]+/g) ?? [];
  let i = 0;
  const peek = () => tokens[i];
  const primary = () => {
    const token = tokens[i++];
    if (token === '(') {
      const inner = or();
      if (tokens[i++] !== ')') throw new Error(`unbalanced parentheses in "${expression}"`);
      return inner;
    }
    if (!token || /^(AND|OR|WITH|\))$/i.test(token))
      throw new Error(`malformed licence expression "${expression}"`);
    if (peek()?.toUpperCase() === 'WITH') {
      i += 1;
      return { id: token.replace(/\+$/, ''), exception: tokens[i++] };
    }
    return { id: token.replace(/\+$/, '') };
  };
  const and = () => {
    let left = primary();
    while (peek()?.toUpperCase() === 'AND') {
      i += 1;
      left = { and: [left, primary()] };
    }
    return left;
  };
  const or = () => {
    let left = and();
    while (peek()?.toUpperCase() === 'OR') {
      i += 1;
      left = { or: [left, and()] };
    }
    return left;
  };
  const tree = or();
  if (i !== tokens.length) throw new Error(`unexpected "${tokens[i]}" in "${expression}"`);
  return tree;
}

const rank = (id) => {
  const index = ALLOWED.indexOf(id);
  return index === -1 ? (CONDITIONAL[id] ? 100 : 1000) : index;
};

/**
 * Picks the licence that applies: for `A OR B` the most permissive acceptable option, for `A AND B` both. The status is
 * 'allowed', 'conditional', 'denied' or 'unknown'.
 */
export function evaluate(expression) {
  if (!expression || /^(UNKNOWN|UNLICENSED|SEE LICENSE)/i.test(expression))
    return { chosen: expression, status: 'unknown' };
  if (expression.startsWith('LicenseRef-')) return { chosen: expression, status: 'conditional' };
  let tree;
  try {
    tree = parseSpdx(expression);
  } catch {
    return { chosen: expression, status: 'unknown' };
  }
  const order = { allowed: 0, conditional: 1, unknown: 2, denied: 3 };
  const walk = (node) => {
    if (node.or) {
      const options = node.or
        .map(walk)
        .sort((a, b) => order[a.status] - order[b.status] || a.rank - b.rank);
      return options[0];
    }
    if (node.and) {
      const parts = node.and.map(walk);
      const worst = parts.reduce((a, b) => (order[b.status] > order[a.status] ? b : a));
      return {
        text: parts.map((p) => p.text).join(' AND '),
        status: worst.status,
        rank: Math.max(...parts.map((p) => p.rank)),
      };
    }
    const text = node.exception ? `${node.id} WITH ${node.exception}` : node.id;
    let status = ALLOWED.includes(node.id)
      ? 'allowed'
      : CONDITIONAL[node.id]
        ? 'conditional'
        : 'unknown';
    if (DENIED.test(node.id)) status = 'denied';
    if (node.exception && !ALLOWED_EXCEPTIONS.has(node.exception) && status !== 'denied')
      status = 'unknown';
    return { text, status, rank: rank(node.id) };
  };
  const result = walk(tree);
  return { chosen: result.text, status: result.status };
}

export function declaredLicense(manifest) {
  const raw = manifest.license ?? manifest.licenses;
  if (raw === undefined || raw === null) return null;
  if (Array.isArray(raw)) return raw.map((l) => (typeof l === 'string' ? l : l.type)).join(' OR ');
  if (typeof raw === 'object') return raw.type ?? null;
  return String(raw);
}

export function sniffLicenses(text) {
  const t = text.slice(0, 20000).replace(/\s+/g, ' ');
  const found = [];
  if (/Blue Oak Model License/i.test(t)) found.push('BlueOak-1.0.0');
  if (/Apache License,? Version 2\.0/i.test(t)) found.push('Apache-2.0');
  if (/Mozilla Public License,? (Version|v\.?) ?2\.0/i.test(t)) found.push('MPL-2.0');
  if (/free and unencumbered software released into the public domain/i.test(t))
    found.push('Unlicense');
  if (/Permission is hereby granted, free of charge/i.test(t)) found.push('MIT');
  if (/Permission to use, copy, modify, and\/?or distribute this software for any purpose/i.test(t))
    found.push(/provided that the above copyright notice/i.test(t) ? 'ISC' : '0BSD');
  if (/Redistribution and use in source and binary forms/i.test(t))
    found.push(
      /Neither the name|names of (its|the|any) contributors/i.test(t)
        ? 'BSD-3-Clause'
        : 'BSD-2-Clause',
    );
  if (/CC0 1\.0 Universal/i.test(t)) found.push('CC0-1.0');
  return found;
}

/** Copyright lines of a licence text (template placeholders and "the above copyright notice" sentences excluded). */
export function copyrightLines(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw
      .trim()
      .replace(/^[#*>\-\s]+/, '')
      .replace(/\s+/g, ' ');
    // "Copyright 2020 Name", "Copyright (c) Name", "© Name", "(c) 2020 Name"; not "copyright license to ..." or the
    // "(c) You must retain ..." clause of the Apache License.
    const named = /^copyright\s*(\(c\)|©)?\s*:?\s*(.*)$/i.exec(line);
    const ok = named
      ? /^(\d{4}|[A-Z(<"]|\w+@)/.test(named[2])
      : /^©\s*\S/.test(line) ||
        /^\(c\)\s*\d{4}/i.test(line) ||
        /\bCopyright\s+(\(c\)\s*)?(\d{4}|[A-Z][a-z])/.test(line);
    if (!ok) continue;
    if (
      /notice|\[yyyy\]|\{yyyy\}|<year>|\[name of copyright owner\]|copyright holders? (and|be)/i.test(
        line,
      )
    )
      continue;
    if (!out.includes(line)) out.push(line.slice(0, 200));
  }
  return out;
}

export const normalizeText = (text) =>
  text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .trim();
export const textHash = (text) => createHash('sha256').update(normalizeText(text)).digest('hex');
