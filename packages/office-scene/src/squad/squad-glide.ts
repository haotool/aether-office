// An exponential approach, not a spring, so it never overshoots and always settles.
export type Point2 = { x: number; z: number };

export class Glide {
  private readonly shown = new Map<string, Point2>();
  moving = false;

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

  prune(keep: ReadonlySet<string>): void {
    for (const key of this.shown.keys()) if (!keep.has(key)) this.shown.delete(key);
  }

  begin(): void {
    this.moving = false;
  }
}
