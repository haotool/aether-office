// A point that eases toward where it should be: a zone that grows or shrinks, and the pods and sitters in it, glide
// instead of jumping. Not a spring: an exponential approach, so it never overshoots and always settles.
export type Point2 = { x: number; z: number };

export class Glide {
  private readonly shown = new Map<string, Point2>();
  /** Whether anything was still on its way at the last `to`/`prune` round. */
  moving = false;

  /** Where `key` is shown, one step of `dt` seconds on its way to the target. A new key starts at its target. */
  to(key: string, target: Point2, dt: number, tau: number): Point2 {
    const now = this.shown.get(key);
    if (!now) {
      const first = { ...target };
      this.shown.set(key, first);
      return first;
    }
    const k = tau <= 0 ? 1 : 1 - Math.exp(-dt / tau);
    now.x += (target.x - now.x) * k;
    now.z += (target.z - now.z) * k;
    if (Math.abs(target.x - now.x) < 0.002 && Math.abs(target.z - now.z) < 0.002) {
      now.x = target.x;
      now.z = target.z;
    } else this.moving = true;
    return now;
  }

  /** Forgets the keys not in `keep`, so a pod that went away starts afresh if it returns. */
  prune(keep: ReadonlySet<string>): void {
    for (const key of this.shown.keys()) if (!keep.has(key)) this.shown.delete(key);
  }

  /** Starts a round: `moving` is true again only if something still moves before the next one. */
  begin(): void {
    this.moving = false;
  }
}
