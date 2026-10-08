type FieldPerfHookWindow = Window & {
  __aetherFieldPerfHook?: { onContextLost: () => void; onContextRestored: () => void };
};

/** Forwards WebGL context events to the opt-in field perf collector when present. */
export function fieldPerfOfficeSceneHandlers(onContextLost: () => void) {
  return {
    onContextLost: () => {
      onContextLost();
      (window as FieldPerfHookWindow).__aetherFieldPerfHook?.onContextLost();
    },
    onContextRestored: () => {
      (window as FieldPerfHookWindow).__aetherFieldPerfHook?.onContextRestored();
    },
  };
}
