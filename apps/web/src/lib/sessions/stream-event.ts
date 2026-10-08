// The page only needs to know that a domain event from its own server is well formed before it refetches the snapshot.
// The full schema (`eventSchema`) would pull the whole of zod into the first-load bundle (110 KB of JavaScript).

/** True for the JSON of a domain event: an object with a numeric-string `seq` and a dotted lower-case `type`. */
export function isDomainEvent(json: string): boolean {
  try {
    const event: unknown = JSON.parse(json);
    if (typeof event !== 'object' || event === null) return false;
    const { seq, type } = event as Record<string, unknown>;
    return (
      typeof seq === 'string' &&
      /^\d+$/.test(seq) &&
      typeof type === 'string' &&
      /^[a-z][a-z.]+$/.test(type)
    );
  } catch {
    return false;
  }
}
