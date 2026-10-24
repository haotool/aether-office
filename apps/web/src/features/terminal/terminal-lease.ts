export const RENEW_WITHIN_MS = 15_000;
export const RENEW_TICK_MS = 5_000;

export const needsRenewal = (leaseUntil: number | null, now: number): boolean =>
  (leaseUntil ?? 0) - now <= RENEW_WITHIN_MS;

export function sizeOf(snapshot: string | null): { cols: number; rows: number } {
  try {
    const { dimensions } = JSON.parse(snapshot ?? 'null') as {
      dimensions?: { cols?: unknown; rows?: unknown };
    };
    if (typeof dimensions?.cols === 'number' && typeof dimensions.rows === 'number')
      return { cols: dimensions.cols, rows: dimensions.rows };
  } catch {
    return { cols: 80, rows: 24 };
  }
  return { cols: 80, rows: 24 };
}
