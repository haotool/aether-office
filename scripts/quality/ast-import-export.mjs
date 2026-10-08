import { SyntaxKind } from 'typescript/unstable/ast';

export function importFacts(node) {
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

export function exportDeclarationFacts(node, line) {
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
