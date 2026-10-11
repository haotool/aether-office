export const BOARD = [
  ['boardTodo', ['backlog', 'ready', 'blocked']],
  ['boardDoing', ['assigned', 'running', 'cancel_requested']],
  ['boardReview', ['reviewing', 'changes_requested', 'verified']],
  ['boardDone', ['completed']],
  ['boardTrouble', ['failed', 'indeterminate', 'cancelled']],
] as const;
export const boardStates = BOARD.flatMap(([, states]) => states);
