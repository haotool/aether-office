import { SyntaxKind } from 'typescript/unstable/ast';
import { exportDeclarationFacts, importFacts } from './ast-import-export.mjs';
import { cognitiveComplexity, isSonarFunction } from './ast-cognitive.mjs';
import { nestingOf } from './ast-nesting.mjs';
import { functionName, hasModifier, nameOf, NAMED_DECLARATIONS } from './ast-shared.mjs';

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
    if (isSonarFunction(node)) {
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
