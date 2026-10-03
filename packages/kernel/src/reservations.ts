// Advisory file reservations: path-pattern normalisation and conflict detection. Pure, no I/O.
// Reservations coordinate cooperating agents on this platform; they cannot stop another process
// running as the same OS user from writing a file.

const WILDCARD = /[*?[\]{}]/;

/** Repo-relative POSIX pattern, or null when it is unsafe or empty. */
export function normalizePattern(pattern: string): string | null {
  const p = pattern.trim().replace(/^(\.\/)+/, '');
  if (!p || p.length > 256 || /[\0\\]/.test(p) || p.startsWith('/') || /^[a-zA-Z]:/.test(p))
    return null;
  const parts = p.split('/');
  if (parts.some((part) => part === '..' || part === '')) return null;
  return parts.join('/');
}

/** Directory scope of a pattern: its literal prefix up to the last slash before any wildcard. */
function scopeOf(pattern: string): string {
  const parts = pattern.split('/');
  const literal: string[] = [];
  for (const part of parts) {
    if (WILDCARD.test(part)) break;
    literal.push(part);
  }
  // A fully literal pattern is its own scope (file or directory).
  return literal.join('/');
}

// ponytail: conservative scope comparison (may report a conflict for disjoint globs inside one
// directory); upgrade to real glob intersection if false positives hurt.
export function patternsOverlap(a: string, b: string): boolean {
  const x = scopeOf(a);
  const y = scopeOf(b);
  return x === '' || y === '' || x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`);
}

export type Reservation = {
  id: string;
  ownerId: string;
  patterns: readonly string[];
  expiresAt: number;
};

/** Active reservations held by someone else that overlap any requested pattern. */
export function findConflicts(
  requested: readonly string[],
  ownerId: string,
  held: readonly Reservation[],
  now: number,
): { reservationId: string; ownerId: string; pattern: string; requested: string }[] {
  return held.flatMap((r) =>
    r.ownerId === ownerId || r.expiresAt <= now
      ? []
      : r.patterns.flatMap((pattern) =>
          requested
            .filter((req) => patternsOverlap(pattern, req))
            .map((req) => ({ reservationId: r.id, ownerId: r.ownerId, pattern, requested: req })),
        ),
  );
}
