export const NOW = Date.now();
export const MIN = 60_000;
export const DAY = 86_400_000;
export const iso = (agoMs) => new Date(NOW - agoMs).toISOString();
