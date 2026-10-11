import type { FieldPerfUaParse } from './field-perf-types.js';

const emptyUa: FieldPerfUaParse = {
  browser: null,
  browserVersion: null,
  os: null,
  osVersion: null,
};

function parseIosUserAgent(ua: string): FieldPerfUaParse | null {
  const ios = ua.match(/OS (\d+[_\d]*) like Mac OS X/i);
  if (!ios) return null;
  const ver = ios[1]?.replace(/_/g, '.') ?? null;
  const crios = ua.match(/CriOS\/([\d.]+)/);
  if (crios)
    return { os: 'iOS', osVersion: ver, browser: 'Chrome', browserVersion: crios[1] ?? null };
  const fx = ua.match(/FxiOS\/([\d.]+)/);
  if (fx) return { os: 'iOS', osVersion: ver, browser: 'Firefox', browserVersion: fx[1] ?? null };
  const safari = ua.includes('Safari') && !ua.includes('CriOS') && !ua.includes('FxiOS');
  const sv = ua.match(/Version\/([\d.]+)/);
  return {
    os: 'iOS',
    osVersion: ver,
    browser: safari ? 'Safari' : null,
    browserVersion: safari ? (sv?.[1] ?? null) : null,
  };
}

function parseAndroidUserAgent(ua: string): FieldPerfUaParse | null {
  const android = ua.match(/Android (\d+(?:\.\d+)?)/i);
  if (!android) return null;
  const ver = android[1] ?? null;
  const chrome = ua.match(/Chrome\/([\d.]+)/);
  if (chrome && ua.includes('Chrome'))
    return { os: 'Android', osVersion: ver, browser: 'Chrome', browserVersion: chrome[1] ?? null };
  return { os: 'Android', osVersion: ver, browser: null, browserVersion: null };
}

function parseMacUserAgent(ua: string): FieldPerfUaParse | null {
  const mac = ua.match(/Mac OS X (\d+[_\d]*)/i);
  if (!mac) return null;
  const ver = mac[1]?.replace(/_/g, '.') ?? null;
  const chrome = ua.match(/Chrome\/([\d.]+)/);
  if (chrome)
    return { os: 'macOS', osVersion: ver, browser: 'Chrome', browserVersion: chrome[1] ?? null };
  const sv = ua.match(/Version\/([\d.]+).*Safari/);
  if (sv) return { os: 'macOS', osVersion: ver, browser: 'Safari', browserVersion: sv[1] ?? null };
  return { ...emptyUa, os: 'macOS', osVersion: ver };
}

export function parseUserAgent(ua: string): FieldPerfUaParse {
  return parseIosUserAgent(ua) ?? parseAndroidUserAgent(ua) ?? parseMacUserAgent(ua) ?? emptyUa;
}
