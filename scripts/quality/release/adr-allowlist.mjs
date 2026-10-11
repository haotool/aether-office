const ALLOW_RE = /^fan-in-allow:\s*(\S+)\s*$/;
export const FAN_IN_ALLOW_MAX = 5;

/** @param {import('../repo.mjs').Repo} repo */
export function parseFanInAllowlist(repo) {
  const declarations = [];
  for (const file of repo.files.filter((f) => f.startsWith('docs/adr/') && f.endsWith('.md'))) {
    repo
      .read(file)
      .split('\n')
      .forEach((line, i) => {
        const m = ALLOW_RE.exec(line.trim());
        if (m) declarations.push({ file, line: i + 1, path: m[1] });
      });
  }
  const allowed = new Set();
  const detail = [];
  let violations = 0;
  for (const decl of declarations.slice(0, FAN_IN_ALLOW_MAX)) {
    const normalized = decl.path.replace(/\\/g, '/');
    if (normalized.startsWith('../') || normalized.startsWith('/')) {
      violations += 1;
      detail.push(`${decl.file}:${decl.line} path not allowed ${decl.path}`);
      continue;
    }
    if (!repo.exists(normalized)) {
      violations += 1;
      detail.push(`${decl.file}:${decl.line} missing target ${decl.path}`);
      continue;
    }
    allowed.add(normalized);
  }
  for (const decl of declarations.slice(FAN_IN_ALLOW_MAX)) {
    violations += 1;
    detail.push(`${decl.file}:${decl.line} over allowlist cap ${decl.path}`);
  }
  if (declarations.length > FAN_IN_ALLOW_MAX) {
    detail.unshift(
      `${declarations.length - FAN_IN_ALLOW_MAX} fan-in-allow over limit ${FAN_IN_ALLOW_MAX}`,
    );
  }
  return { allowed, violations, detail, declarations: declarations.length };
}
