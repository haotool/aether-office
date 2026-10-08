// Syntax-tree facts for the structure and type rules, read through the TypeScript compiler API that ships with the
// installed `typescript` package (7.x: the unstable sync API, which starts the local native compiler; no network).
// `analyzeFile` is pure over a parsed source file; `analyzeProject` opens tsconfig.json and returns facts per file.
import { SyntaxKind } from 'typescript/unstable/ast';

const FUNCTIONS = new Set([
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.FunctionExpression,
  SyntaxKind.ArrowFunction,
  SyntaxKind.MethodDeclaration,
  SyntaxKind.Constructor,
  SyntaxKind.GetAccessor,
  SyntaxKind.SetAccessor,
]);
const LOOPS = new Set([
  SyntaxKind.ForStatement,
  SyntaxKind.ForInStatement,
  SyntaxKind.ForOfStatement,
  SyntaxKind.WhileStatement,
  SyntaxKind.DoStatement,
]);
const BRANCHES = new Set([
  SyntaxKind.IfStatement,
  SyntaxKind.SwitchStatement,
  SyntaxKind.TryStatement,
]);
const AND = SyntaxKind.AmpersandAmpersandToken;
const OR = SyntaxKind.BarBarToken;
const NESTING_FLOW = new Set([
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
const COGNITIVE_LIMIT = 15;
const NAMED_DECLARATIONS = new Set([
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.ClassDeclaration,
  SyntaxKind.InterfaceDeclaration,
  SyntaxKind.TypeAliasDeclaration,
  SyntaxKind.EnumDeclaration,
]);

const hasModifier = (node, kind) => Boolean(node.modifiers?.some((m) => m.kind === kind));
const nameOf = (node) => node.name?.text ?? '(anonymous)';

/** Name of a function-like node, borrowing the variable or property it is assigned to. */
function functionName(node) {
  if (node.name) return node.name.text ?? '(computed)';
  const parent = node.parent;
  if (parent?.name?.text) return parent.name.text;
  return '(anonymous)';
}

function importFacts(node) {
  const spec = node.moduleSpecifier.text;
  const clause = node.importClause;
  const bindings = clause?.namedBindings;
  const names = [];
  if (clause?.name) names.push('default');
  if (bindings?.kind === SyntaxKind.NamedImports)
    for (const e of bindings.elements) names.push((e.propertyName ?? e.name).text);
  return {
    spec,
    names,
    namespace: bindings?.kind === SyntaxKind.NamespaceImport,
    typeOnly: clause?.phaseModifier === SyntaxKind.TypeKeyword,
  };
}

function exportDeclarationFacts(node, line) {
  const clause = node.exportClause;
  if (!node.moduleSpecifier) {
    const exported = (clause?.elements ?? []).map((e) => ({ name: e.name.text, line }));
    return { exports: exported };
  }
  const spec = node.moduleSpecifier.text;
  if (!clause || clause.kind === SyntaxKind.NamespaceExport)
    return { reexportAll: spec, exports: [] };
  const names = clause.elements.map((e) => (e.propertyName ?? e.name).text);
  return { reexport: { spec, names, namespace: false, typeOnly: node.isTypeOnly }, exports: [] };
}

/** Walks one function body; returns its deepest control-flow nesting. Nested functions are measured on their own. */
function nestingOf(body) {
  let deepest = 0;
  const visit = (node, depth) => {
    if (node !== body && FUNCTIONS.has(node.kind)) return;
    const inner =
      node.kind === SyntaxKind.CatchClause || BRANCHES.has(node.kind) || LOOPS.has(node.kind);
    // `else if` continues the chain instead of nesting one level deeper.
    const chained =
      node.kind === SyntaxKind.IfStatement && node.parent?.kind === SyntaxKind.IfStatement;
    const next = inner && !chained && node.kind !== SyntaxKind.TryStatement ? depth + 1 : depth;
    deepest = Math.max(deepest, next);
    node.forEachChild((child) => visit(child, next));
  };
  body.forEachChild((child) => visit(child, 0));
  return deepest;
}

const isElseIf = (node) =>
  node.kind === SyntaxKind.IfStatement &&
  node.parent?.kind === SyntaxKind.IfStatement &&
  node.parent.elseStatement === node;

// SonarJS 4.2.2 (black-box): `else { if … }` after `else if` skips the +1 else wrapper when nesting > 2.
function loneIfInElseBlock(elseStatement) {
  if (elseStatement?.kind !== SyntaxKind.Block) return null;
  const [only] = elseStatement.statements;
  if (elseStatement.statements.length === 1 && only?.kind === SyntaxKind.IfStatement) return only;
  return null;
}

// SonarJS: ternary conditions already include their `&&` group; skip duplicate logic on return/const walks.
function expressionHasTernary(expr) {
  if (!expr) return false;
  if (expr.kind === SyntaxKind.ConditionalExpression) return true;
  let found = false;
  expr.forEachChild((child) => {
    if (expressionHasTernary(child)) found = true;
  });
  return found;
}

/** SonarJS 4.2.2 black-box: `||` does not add complexity; each `||` operand that contains `&&` adds +1. */
function containsAnd(node) {
  if (!node) return false;
  if (FUNCTIONS.has(node.kind)) return false;
  if (node.kind === SyntaxKind.BinaryExpression && node.operatorToken.kind === AND) return true;
  let found = false;
  node.forEachChild((child) => {
    if (containsAnd(child)) found = true;
  });
  return found;
}

function sonarLogicIncrements(expr) {
  if (!expr) return 0;
  if (FUNCTIONS.has(expr.kind)) return 0;
  if (expr.kind === SyntaxKind.ParenthesizedExpression)
    return sonarLogicIncrements(expr.expression);
  if (expr.kind === SyntaxKind.BinaryExpression && expr.operatorToken.kind === OR)
    return sonarLogicIncrements(expr.left) + sonarLogicIncrements(expr.right);
  return containsAnd(expr) ? 1 : 0;
}

/** Ternaries (and their nesting) inside if/call conditions, without re-walking logic sequences. */
function visitConditionExpr(expr, visit, nesting) {
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

const TEST_CALLEES = new Set([
  'describe',
  'it',
  'test',
  'beforeEach',
  'afterEach',
  'beforeAll',
  'afterAll',
]);

function callCalleeName(call) {
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

/** `it`/`test` callbacks nested inside another test helper callback are not separate units (SonarJS 4.2.2). */
function suppressNestedTestCallback(node) {
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

function isSonarArrowOrExpr(node) {
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

function nestedSonarUnitsIn(body, skip) {
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

/** Whether this function gets its own SonarJS cognitive-complexity report (black-box rules). */
function isSonarFunction(node) {
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

/** Sonar-style cognitive complexity for one function body (nested functions measured separately). */
export function cognitiveComplexity(body) {
  let total = 0;
  const add = (n) => {
    total += n;
  };

  const visit = (node, nesting) => {
    if (node !== body && FUNCTIONS.has(node.kind)) return;

    if (node.kind === SyntaxKind.IfStatement) {
      add(sonarLogicIncrements(node.expression));
      visitConditionExpr(node.expression, visit, nesting);
      const elseIf = isElseIf(node);
      add(elseIf ? 1 : 1 + nesting);
      // SonarJS: `else if` continues the chain at the same nesting as its parent `if`.
      const innerNest = elseIf ? nesting : nesting + 1;
      visit(node.thenStatement, innerNest);
      if (node.elseStatement) {
        if (node.elseStatement.kind === SyntaxKind.IfStatement)
          visit(node.elseStatement, innerNest);
        else {
          const loneIf = isElseIf(node) ? loneIfInElseBlock(node.elseStatement) : null;
          if (loneIf && nesting > 2) visit(loneIf, innerNest);
          else if (loneIf) {
            add(1);
            visit(loneIf, innerNest);
          } else {
            add(1);
            visit(node.elseStatement, innerNest);
          }
        }
      }
      return;
    }

    if (node.kind === SyntaxKind.TryStatement) {
      if (node.tryBlock) visit(node.tryBlock, nesting);
      if (node.catchClause) visit(node.catchClause, nesting);
      if (node.finallyBlock) visit(node.finallyBlock, nesting);
      return;
    }

    if (node.kind === SyntaxKind.ContinueStatement || node.kind === SyntaxKind.BreakStatement) {
      if (node.label) add(1);
      return;
    }

    if (node.kind === SyntaxKind.ReturnStatement) {
      if (node.expression) {
        if (node.expression.kind === SyntaxKind.ConditionalExpression)
          visit(node.expression, nesting);
        else {
          add(sonarLogicIncrements(node.expression));
          visit(node.expression, nesting);
        }
      }
      return;
    }

    if (node.kind === SyntaxKind.VariableDeclaration) {
      const init = node.initializer;
      if (init && !expressionHasTernary(init)) add(sonarLogicIncrements(init));
      node.forEachChild((child) => visit(child, nesting));
      return;
    }

    if (node.kind === SyntaxKind.ConditionalExpression) {
      add(1 + nesting);
      add(sonarLogicIncrements(node.condition));
      const innerNest = nesting + 1;
      visit(node.whenTrue, innerNest);
      visit(node.whenFalse, innerNest);
      return;
    }

    if (node.kind === SyntaxKind.ForStatement) {
      add(1 + nesting);
      add(sonarLogicIncrements(node.condition));
      visitConditionExpr(node.condition, visit, nesting);
      const innerNest = nesting + 1;
      if (node.initializer) visit(node.initializer, innerNest);
      if (node.incrementor) visit(node.incrementor, innerNest);
      if (node.statement) visit(node.statement, innerNest);
      return;
    }

    if (node.kind === SyntaxKind.ForOfStatement || node.kind === SyntaxKind.ForInStatement) {
      add(1 + nesting);
      const innerNest = nesting + 1;
      if (node.initializer) visit(node.initializer, innerNest);
      if (node.expression) visit(node.expression, innerNest);
      if (node.statement) visit(node.statement, innerNest);
      return;
    }

    if (node.kind === SyntaxKind.WhileStatement || node.kind === SyntaxKind.DoStatement) {
      add(1 + nesting);
      const cond = node.kind === SyntaxKind.WhileStatement ? node.expression : node.expression;
      add(sonarLogicIncrements(cond));
      visitConditionExpr(cond, visit, nesting);
      const innerNest = nesting + 1;
      if (node.statement) visit(node.statement, innerNest);
      return;
    }

    if (node.kind === SyntaxKind.CatchClause) {
      add(1 + nesting);
      visit(node.block, nesting + 1);
      return;
    }

    if (node.kind === SyntaxKind.SwitchStatement) {
      add(1 + nesting);
      const innerNest = nesting + 1;
      for (const clause of node.caseBlock.clauses) visit(clause, innerNest);
      return;
    }

    node.forEachChild((child) => visit(child, nesting));
  };

  if (body.kind === SyntaxKind.Block) body.forEachChild((child) => visit(child, 0));
  else {
    if (body.kind === SyntaxKind.BinaryExpression) add(sonarLogicIncrements(body));
    visit(body, 0);
  }
  return total;
}

export { COGNITIVE_LIMIT };

/** Facts about one parsed source file. `file` is the repository-relative path used in reports. */
export function analyzeFile(sourceFile, file) {
  const lineOf = (pos) => sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
  const facts = {
    file,
    lines: sourceFile.getLineStarts().length,
    functions: [],
    imports: [],
    reexports: [],
    reexportAll: [],
    exports: [],
    any: [],
    nonNull: [],
    unknownCasts: [],
  };
  const visit = (node) => {
    const start = () => node.getStart(sourceFile);
    if (FUNCTIONS.has(node.kind) && isSonarFunction(node)) {
      const measureBody = node.body;
      if (!measureBody) return;
      const first = lineOf(start());
      facts.functions.push({
        name: functionName(node),
        line: first,
        length: lineOf(node.end) - first + 1,
        nesting: nestingOf(measureBody),
        cognitive: cognitiveComplexity(measureBody),
      });
    } else if (node.kind === SyntaxKind.AnyKeyword) facts.any.push(lineOf(start()));
    else if (node.kind === SyntaxKind.NonNullExpression) facts.nonNull.push(lineOf(start()));
    else if (
      node.kind === SyntaxKind.AsExpression &&
      node.expression.kind === SyntaxKind.AsExpression &&
      node.expression.type.kind === SyntaxKind.UnknownKeyword
    )
      facts.unknownCasts.push(lineOf(start()));
    else if (
      node.kind === SyntaxKind.CallExpression &&
      node.expression.kind === SyntaxKind.ImportKeyword &&
      node.arguments[0]?.kind === SyntaxKind.StringLiteral
    )
      facts.imports.push({
        spec: node.arguments[0].text,
        names: [],
        namespace: true,
        typeOnly: false,
      });
    node.forEachChild(visit);
  };
  for (const statement of sourceFile.statements) {
    const line = lineOf(statement.getStart(sourceFile));
    if (statement.kind === SyntaxKind.ImportDeclaration) facts.imports.push(importFacts(statement));
    else if (statement.kind === SyntaxKind.ExportDeclaration) {
      const found = exportDeclarationFacts(statement, line);
      if (found.reexport) facts.reexports.push(found.reexport);
      if (found.reexportAll) facts.reexportAll.push(found.reexportAll);
      facts.exports.push(...found.exports);
    } else if (statement.kind === SyntaxKind.ExportAssignment)
      facts.exports.push({ name: 'default', line });
    else if (hasModifier(statement, SyntaxKind.ExportKeyword)) {
      if (hasModifier(statement, SyntaxKind.DefaultKeyword))
        facts.exports.push({ name: 'default', line });
      else if (statement.kind === SyntaxKind.VariableStatement)
        for (const d of statement.declarationList.declarations)
          facts.exports.push({ name: nameOf(d), line });
      else if (NAMED_DECLARATIONS.has(statement.kind))
        facts.exports.push({ name: nameOf(statement), line });
    }
    visit(statement);
  }
  return facts;
}

/** Opens `tsconfig.json` under `root` and returns { facts, compilerOptions, programFiles } for the files kept by `keep`. */
export async function analyzeProject(root, keep) {
  const { API } = await import('typescript/unstable/sync');
  const api = new API({ cwd: root });
  try {
    const project = api.updateSnapshot({ openProject: 'tsconfig.json' }).getProjects()[0];
    const prefix = `${root}/`;
    const names = project.program.getSourceFileNames().filter((n) => n.startsWith(prefix));
    const facts = [];
    for (const name of names) {
      const file = name.slice(prefix.length);
      if (!keep(file)) continue;
      const sourceFile = project.program.getSourceFile(name);
      if (sourceFile) facts.push(analyzeFile(sourceFile, file));
    }
    return {
      facts,
      compilerOptions: project.compilerOptions,
      programFiles: names.map((n) => n.slice(prefix.length)),
    };
  } finally {
    api.close();
  }
}
