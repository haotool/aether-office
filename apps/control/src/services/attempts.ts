/** Failed-attempt counters by caller (login, enrolment, hook), shared so one limit cannot be dodged by another route. */
export type Attempts = Map<string, { count: number; until: number }>;
export const MAX_ATTEMPTS = 1000;

/** Forgets the counters whose window has passed, then the oldest ones beyond `max`, so a flood of addresses cannot grow it. */
export function pruneAttempts(attempts: Attempts, now: number, max = MAX_ATTEMPTS): void {
  for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
  for (const key of attempts.keys()) {
    if (attempts.size <= max) break;
    attempts.delete(key);
  }
}
