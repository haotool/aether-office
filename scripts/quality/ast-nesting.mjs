import { SyntaxKind } from 'typescript/unstable/ast';
import { BRANCHES, FUNCTIONS, LOOPS } from './ast-shared.mjs';

export function nestingOf(body) {
  let deepest = 0;
  const visit = (node, depth) => {
    if (node !== body && FUNCTIONS.has(node.kind)) return;
    const inner =
      node.kind === SyntaxKind.CatchClause || BRANCHES.has(node.kind) || LOOPS.has(node.kind);
    const chained =
      node.kind === SyntaxKind.IfStatement && node.parent?.kind === SyntaxKind.IfStatement;
    const next = inner && !chained && node.kind !== SyntaxKind.TryStatement ? depth + 1 : depth;
    deepest = Math.max(deepest, next);
    node.forEachChild((child) => visit(child, next));
  };
  body.forEachChild((child) => visit(child, 0));
  return deepest;
}
