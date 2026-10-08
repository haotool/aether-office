// Every work state belongs to exactly one column, so no task disappears from the board.
export const BOARD = [
  ['boardTodo', ['backlog', 'ready', 'blocked']],
  ['boardDoing', ['assigned', 'running', 'cancel_requested']],
  ['boardReview', ['reviewing', 'changes_requested', 'verified']],
  ['boardDone', ['completed']],
  ['boardTrouble', ['failed', 'indeterminate', 'cancelled']],
] as const;
export const boardStates = BOARD.flatMap(([, states]) => states);
