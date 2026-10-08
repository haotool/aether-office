import { SyntaxKind } from 'typescript/unstable/ast';
import { AND, FUNCTIONS, OR } from './ast-shared.mjs';

export const isElseIf = (node) =>
  node.kind === SyntaxKind.IfStatement &&
  node.parent?.kind === SyntaxKind.IfStatement &&
  node.parent.elseStatement === node;

// SonarJS 4.2.2 (black-box): `else { if … }` after `else if` skips the +1 else wrapper when nesting > 2.
export function loneIfInElseBlock(elseStatement) {
  if (elseStatement?.kind !== SyntaxKind.Block) return null;
  const [only] = elseStatement.statements;
  if (elseStatement.statements.length === 1 && only?.kind === SyntaxKind.IfStatement) return only;
  return null;
}

export function expressionHasTernary(expr) {
  if (!expr) return false;
  if (expr.kind === SyntaxKind.ConditionalExpression) return true;
  let found = false;
  expr.forEachChild((child) => {
    if (expressionHasTernary(child)) found = true;
  });
  return found;
}

export function containsAnd(node) {
  if (!node) return false;
  if (FUNCTIONS.has(node.kind)) return false;
  if (node.kind === SyntaxKind.BinaryExpression && node.operatorToken.kind === AND) return true;
  let found = false;
  node.forEachChild((child) => {
    if (containsAnd(child)) found = true;
  });
  return found;
}

export function sonarLogicIncrements(expr) {
  if (!expr) return 0;
  if (FUNCTIONS.has(expr.kind)) return 0;
  if (expr.kind === SyntaxKind.ParenthesizedExpression)
    return sonarLogicIncrements(expr.expression);
  if (expr.kind === SyntaxKind.BinaryExpression && expr.operatorToken.kind === OR)
    return sonarLogicIncrements(expr.left) + sonarLogicIncrements(expr.right);
  return containsAnd(expr) ? 1 : 0;
}

export function visitConditionExpr(expr, visit, nesting) {
  if (!expr || FUNCTIONS.has(expr.kind)) return;
  if (expr.kind === SyntaxKind.ConditionalExpression) visit(expr, nesting);
  else if (expr.kind === SyntaxKind.BinaryExpression) {
    const op = expr.operatorToken.kind;
    if (op === AND || op === OR) {
      visitConditionExpr(expr.left, visit, nesting);
      visitConditionExpr(expr.right, visit, nesting);
    }
  } else if (expr.kind === SyntaxKind.CallExpression) {
    for (const arg of expr.arguments)
      if (arg && !FUNCTIONS.has(arg.kind)) visitConditionExpr(arg, visit, nesting);
  }
}

export const TEST_CALLEES = new Set([
  'describe',
  'it',
  'test',
  'beforeEach',
  'afterEach',
  'beforeAll',
  'afterAll',
]);

export function callCalleeName(call) {
  const e = call.expression;
  if (e?.kind === SyntaxKind.Identifier) return e.text;
  if (e?.kind === SyntaxKind.PropertyAccessExpression && e.name) return e.name.text;
  return null;
}

function enclosingFunctionLike(node) {
  let p = node.parent;
  while (p) {
    if (FUNCTIONS.has(p.kind)) return p;
    p = p.parent;
  }
  return null;
}

function isDirectCallArgument(node) {
  const p = node.parent;
  return p?.kind === SyntaxKind.CallExpression && p.arguments.includes(node);
}

function isVariableInitializer(node) {
  const p = node.parent;
  return p?.kind === SyntaxKind.VariableDeclaration && p.initializer === node;
}

function isConditionalBranch(node) {
  const p = node.parent;
  return (
    p?.kind === SyntaxKind.ConditionalExpression && (p.whenTrue === node || p.whenFalse === node)
  );
}

function isObjectLiteralFunction(node) {
  const p = node.parent;
  return p?.kind === SyntaxKind.PropertyAssignment && p.initializer === node;
}

function isReturnValue(node) {
  const p = node.parent;
  return p?.kind === SyntaxKind.ReturnStatement && p.expression === node;
}

function isJsxCallback(node) {
  let p = node.parent;
  if (p?.kind === SyntaxKind.JsxExpression) p = p.parent;
  return p?.kind === SyntaxKind.JsxAttribute;
}

function containsNode(root, target) {
  if (root === target) return true;
  let found = false;
  root.forEachChild((child) => {
    if (containsNode(child, target)) found = true;
  });
  return found;
}

export function suppressNestedTestCallback(node) {
  if (!isDirectCallArgument(node)) return false;
  const innerCall = node.parent;
  const innerName = callCalleeName(innerCall);
  if (!innerName || !TEST_CALLEES.has(innerName)) return false;
  let p = innerCall.parent;
  while (p) {
    if (p.kind === SyntaxKind.CallExpression) {
      const outerName = callCalleeName(p);
      if (outerName && TEST_CALLEES.has(outerName)) {
        const cb = p.arguments.find((a) => a && FUNCTIONS.has(a.kind));
        if (cb && containsNode(cb, innerCall)) return true;
      }
    }
    p = p.parent;
  }
  return false;
}

export function isSonarArrowOrExpr(node) {
  if (node.kind !== SyntaxKind.ArrowFunction && node.kind !== SyntaxKind.FunctionExpression)
    return false;
  if (suppressNestedTestCallback(node)) return false;
  if (isVariableInitializer(node)) return true;
  if (isDirectCallArgument(node)) return true;
  if (isConditionalBranch(node)) return true;
  if (isObjectLiteralFunction(node)) return true;
  if (isReturnValue(node)) return true;
  if (isJsxCallback(node)) return true;
  if (!enclosingFunctionLike(node)) {
    return (
      isVariableInitializer(node) ||
      isDirectCallArgument(node) ||
      node.parent?.kind === SyntaxKind.ExportAssignment
    );
  }
  return false;
}

export function nestedSonarUnitsIn(body, skip) {
  let found = false;
  const walk = (node) => {
    if (node === skip) return;
    if (node !== body && FUNCTIONS.has(node.kind)) {
      if (node.kind === SyntaxKind.FunctionDeclaration) {
        found = true;
        return;
      }
      if (isSonarArrowOrExpr(node)) {
        found = true;
        return;
      }
      return;
    }
    node.forEachChild(walk);
  };
  if (body.kind === SyntaxKind.Block) body.forEachChild(walk);
  else walk(body);
  return found;
}
