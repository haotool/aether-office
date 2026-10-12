// A synthetic 2D canvas context that records what is drawn instead of drawing it (the repo has no canvas
// implementation); properties such as fillStyle are plain assignable fields.
export type DrawCall = { op: string; args: unknown[] };

export function recordingContext() {
  const calls: DrawCall[] = [];
  const state: Record<string, unknown> = { fillStyle: '#000', strokeStyle: '#000', globalAlpha: 1 };
  const context = new Proxy(state, {
    get(target, name: string) {
      if (name in target) return target[name];
      return (...args: unknown[]) => {
        calls.push({ op: name, args });
        if (name === 'measureText') return { width: String(args[0]).length * 7 };
        if (name === 'createLinearGradient' || name === 'createRadialGradient')
          return {
            addColorStop: (...stop: unknown[]) => calls.push({ op: 'addColorStop', args: stop }),
          };
        return undefined;
      };
    },
    set(target, name: string, value) {
      target[name] = value;
      calls.push({ op: `set ${name}`, args: [value] });
      return true;
    },
  });
  return { g: context as unknown as CanvasRenderingContext2D, calls };
}

/** Every number a drawing call was given, to catch coordinates that went wrong (NaN, Infinity). */
export const numbersOf = (calls: readonly DrawCall[]) =>
  calls.flatMap((call) => call.args.filter((arg): arg is number => typeof arg === 'number'));

export const textsOf = (calls: readonly DrawCall[]) =>
  calls
    .filter((call) => call.op === 'fillText' || call.op === 'strokeText')
    .map((call) => String(call.args[0]));
