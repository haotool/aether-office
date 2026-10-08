// Syntax-tree facts for the structure and type rules, read through the TypeScript compiler API that ships with the
// installed `typescript` package (7.x: the unstable sync API, which starts the local native compiler; no network).
// `analyzeFile` is pure over a parsed source file; `analyzeProject` opens tsconfig.json and returns facts per file.
export { COGNITIVE_LIMIT } from './ast-shared.mjs';
export { cognitiveComplexity } from './ast-cognitive.mjs';
export { analyzeFile, analyzeProject } from './ast-analyze.mjs';
