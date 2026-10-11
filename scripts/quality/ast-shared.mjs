import { SyntaxKind } from 'typescript/unstable/ast';

export const FUNCTIONS = new Set([
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.FunctionExpression,
  SyntaxKind.ArrowFunction,
  SyntaxKind.MethodDeclaration,
  SyntaxKind.Constructor,
  SyntaxKind.GetAccessor,
  SyntaxKind.SetAccessor,
]);
export const LOOPS = new Set([
  SyntaxKind.ForStatement,
  SyntaxKind.ForInStatement,
  SyntaxKind.ForOfStatement,
  SyntaxKind.WhileStatement,
  SyntaxKind.DoStatement,
]);
export const BRANCHES = new Set([
  SyntaxKind.IfStatement,
  SyntaxKind.SwitchStatement,
  SyntaxKind.TryStatement,
]);
export const AND = SyntaxKind.AmpersandAmpersandToken;
export const OR = SyntaxKind.BarBarToken;
export const NESTING_FLOW = new Set([
  SyntaxKind.IfStatement,
  SyntaxKind.SwitchStatement,
  SyntaxKind.ForStatement,
  SyntaxKind.ForInStatement,
  SyntaxKind.ForOfStatement,
  SyntaxKind.WhileStatement,
  SyntaxKind.DoStatement,
  SyntaxKind.CatchClause,
  SyntaxKind.ConditionalExpression,
]);
export const COGNITIVE_LIMIT = 15;
export const NAMED_DECLARATIONS = new Set([
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.ClassDeclaration,
  SyntaxKind.InterfaceDeclaration,
  SyntaxKind.TypeAliasDeclaration,
  SyntaxKind.EnumDeclaration,
]);

export const hasModifier = (node, kind) => Boolean(node.modifiers?.some((m) => m.kind === kind));
export const nameOf = (node) => node.name?.text ?? '(anonymous)';

export function functionName(node) {
  if (node.name) return node.name.text ?? '(computed)';
  const parent = node.parent;
  if (parent?.name?.text) return parent.name.text;
  return '(anonymous)';
}
