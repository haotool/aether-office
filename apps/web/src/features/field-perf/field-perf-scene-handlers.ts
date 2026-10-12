type FieldPerfHookWindow = Window & {
  __aetherFieldPerfHook?: { onContextLost: () => void; onContextRestored: () => void };
};

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
