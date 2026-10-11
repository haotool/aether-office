import { analyzeProject } from './ast.mjs';
import { buildGraph } from './graph.mjs';
import { diskRepo } from './repo.mjs';

export async function buildContext(root) {
  const repo = diskRepo(root);
  const known = new Set(repo.files);
  const parsed = await analyzeProject(root, (file) => known.has(file));
  return { repo, ...parsed, graph: buildGraph(repo, parsed.facts) };
}
