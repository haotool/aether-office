import { SyntaxKind } from 'typescript/unstable/ast';
import {
  expressionHasTernary,
  isElseIf,
  loneIfInElseBlock,
  sonarLogicIncrements,
  visitConditionExpr,
} from './ast-cognitive-support.mjs';

export function visitIfStatement(node, nesting, ctx) {
  const { add, visit } = ctx;
  add(sonarLogicIncrements(node.expression));
  visitConditionExpr(node.expression, visit, nesting);
  const elseIf = isElseIf(node);
  add(elseIf ? 1 : 1 + nesting);
  const innerNest = elseIf ? nesting : nesting + 1;
  visit(node.thenStatement, innerNest);
  if (!node.elseStatement) return true;
  if (node.elseStatement.kind === SyntaxKind.IfStatement) {
    visit(node.elseStatement, innerNest);
    return true;
  }
  const loneIf = isElseIf(node) ? loneIfInElseBlock(node.elseStatement) : null;
  if (loneIf && nesting > 2) visit(loneIf, innerNest);
  else if (loneIf) {
    add(1);
    visit(loneIf, innerNest);
  } else {
    add(1);
    visit(node.elseStatement, innerNest);
  }
  return true;
}

export function visitTryStatement(node, nesting, ctx) {
  const { visit } = ctx;
  if (node.tryBlock) visit(node.tryBlock, nesting);
  if (node.catchClause) visit(node.catchClause, nesting);
  if (node.finallyBlock) visit(node.finallyBlock, nesting);
  return true;
}

export function visitContinueBreak(node, ctx) {
  if (node.label) ctx.add(1);
  return true;
}

export function visitReturn(node, nesting, ctx) {
  const { add, visit } = ctx;
  if (!node.expression) return true;
  if (node.expression.kind === SyntaxKind.ConditionalExpression) visit(node.expression, nesting);
  else {
    add(sonarLogicIncrements(node.expression));
    visit(node.expression, nesting);
  }
  return true;
}

export function visitVariableDeclaration(node, nesting, ctx) {
  const { add, visit } = ctx;
  const init = node.initializer;
  if (init && !expressionHasTernary(init)) add(sonarLogicIncrements(init));
  node.forEachChild((child) => visit(child, nesting));
  return true;
}

export function visitConditional(node, nesting, ctx) {
  const { add, visit } = ctx;
  add(1 + nesting);
  add(sonarLogicIncrements(node.condition));
  const innerNest = nesting + 1;
  visit(node.whenTrue, innerNest);
  visit(node.whenFalse, innerNest);
  return true;
}

export function visitForStatement(node, nesting, ctx) {
  const { add, visit } = ctx;
  add(1 + nesting);
  add(sonarLogicIncrements(node.condition));
  visitConditionExpr(node.condition, visit, nesting);
  const innerNest = nesting + 1;
  if (node.initializer) visit(node.initializer, innerNest);
  if (node.incrementor) visit(node.incrementor, innerNest);
  if (node.statement) visit(node.statement, innerNest);
  return true;
}

export function visitForOfIn(node, nesting, ctx) {
  const { add, visit } = ctx;
  add(1 + nesting);
  const innerNest = nesting + 1;
  if (node.initializer) visit(node.initializer, innerNest);
  if (node.expression) visit(node.expression, innerNest);
  if (node.statement) visit(node.statement, innerNest);
  return true;
}

export function visitWhileDo(node, nesting, ctx) {
  const { add, visit } = ctx;
  add(1 + nesting);
  const cond = node.expression;
  add(sonarLogicIncrements(cond));
  visitConditionExpr(cond, visit, nesting);
  const innerNest = nesting + 1;
  if (node.statement) visit(node.statement, innerNest);
  return true;
}

export function visitCatchClause(node, nesting, ctx) {
  ctx.add(1 + nesting);
  ctx.visit(node.block, nesting + 1);
  return true;
}

export function visitSwitchStatement(node, nesting, ctx) {
  ctx.add(1 + nesting);
  const innerNest = nesting + 1;
  for (const clause of node.caseBlock.clauses) ctx.visit(clause, innerNest);
  return true;
}
