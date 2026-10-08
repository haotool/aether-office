import { SyntaxKind } from 'typescript/unstable/ast';
import { FUNCTIONS } from './ast-shared.mjs';
import {
  isSonarArrowOrExpr,
  nestedSonarUnitsIn,
  sonarLogicIncrements,
} from './ast-cognitive-support.mjs';
import {
  visitCatchClause,
  visitConditional,
  visitContinueBreak,
  visitForOfIn,
  visitForStatement,
  visitIfStatement,
  visitReturn,
  visitSwitchStatement,
  visitTryStatement,
  visitVariableDeclaration,
  visitWhileDo,
} from './ast-cognitive-visit.mjs';

/** Sonar-style cognitive complexity for one function body (nested functions measured separately). */
export function cognitiveComplexity(body) {
  let total = 0;
  const add = (n) => {
    total += n;
  };

  const ctx = { add, visit: null };
  const visit = (node, nesting) => {
    if (node !== body && FUNCTIONS.has(node.kind)) return;

    if (node.kind === SyntaxKind.IfStatement) {
      visitIfStatement(node, nesting, ctx);
      return;
    }
    if (node.kind === SyntaxKind.TryStatement) {
      visitTryStatement(node, nesting, ctx);
      return;
    }
    if (node.kind === SyntaxKind.ContinueStatement || node.kind === SyntaxKind.BreakStatement) {
      visitContinueBreak(node, ctx);
      return;
    }
    if (node.kind === SyntaxKind.ReturnStatement) {
      visitReturn(node, nesting, ctx);
      return;
    }
    if (node.kind === SyntaxKind.VariableDeclaration) {
      visitVariableDeclaration(node, nesting, ctx);
      return;
    }
    if (node.kind === SyntaxKind.ConditionalExpression) {
      visitConditional(node, nesting, ctx);
      return;
    }
    if (node.kind === SyntaxKind.ForStatement) {
      visitForStatement(node, nesting, ctx);
      return;
    }
    if (node.kind === SyntaxKind.ForOfStatement || node.kind === SyntaxKind.ForInStatement) {
      visitForOfIn(node, nesting, ctx);
      return;
    }
    if (node.kind === SyntaxKind.WhileStatement || node.kind === SyntaxKind.DoStatement) {
      visitWhileDo(node, nesting, ctx);
      return;
    }
    if (node.kind === SyntaxKind.CatchClause) {
      visitCatchClause(node, nesting, ctx);
      return;
    }
    if (node.kind === SyntaxKind.SwitchStatement) {
      visitSwitchStatement(node, nesting, ctx);
      return;
    }

    node.forEachChild((child) => visit(child, nesting));
  };
  ctx.visit = visit;

  if (body.kind === SyntaxKind.Block) body.forEachChild((child) => visit(child, 0));
  else {
    if (body.kind === SyntaxKind.BinaryExpression) add(sonarLogicIncrements(body));
    visit(body, 0);
  }
  return total;
}

/** Whether this function gets its own SonarJS cognitive-complexity report (black-box rules). */
export function isSonarFunction(node) {
  if (!FUNCTIONS.has(node.kind)) return false;
  if (
    node.kind === SyntaxKind.MethodDeclaration ||
    node.kind === SyntaxKind.Constructor ||
    node.kind === SyntaxKind.GetAccessor ||
    node.kind === SyntaxKind.SetAccessor
  )
    return true;
  if (node.kind === SyntaxKind.FunctionDeclaration) {
    const measureBody = node.body;
    if (!measureBody) return false;
    const cc = cognitiveComplexity(measureBody);
    if (cc === 0 && nestedSonarUnitsIn(measureBody, node)) return false;
    return true;
  }
  return isSonarArrowOrExpr(node);
}
