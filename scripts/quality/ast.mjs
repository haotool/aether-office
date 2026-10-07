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
    if (FUNCTIONS.has(node.kind)) return;
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
    if (FUNCTIONS.has(node.kind) && node.body) {
      const first = lineOf(start());
      facts.functions.push({
        name: functionName(node),
        line: first,
        length: lineOf(node.end) - first + 1,
        nesting: nestingOf(node.body),
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
