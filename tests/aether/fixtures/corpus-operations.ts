import { type CorpusCase, edit, run, tool } from './corpus-types.js';

export const OPERATIONS: CorpusCase[] = [
  {
    name: 'github actions',
    expect: 'platform',
    title: 'Set up GitHub Actions pipeline and Docker build',
    branch: 'chore/ci',
    actions: [...edit('.github/workflows/ci.yml', 'Dockerfile')],
  },
  {
    name: 'terraform',
    expect: 'platform',
    prompt: 'provision the staging vpc with terraform',
    actions: [...edit('infra/network.tf', 'infra/variables.tf'), ...run('terraform plan')],
  },
  {
    name: 'kubernetes manifests',
    expect: 'platform',
    actions: [
      ...edit('deploy/k8s/api.yaml', 'deploy/helm/values.yaml'),
      ...run('kubectl apply --dry-run=client -f deploy/k8s'),
    ],
  },
  {
    name: 'build tooling',
    expect: 'platform',
    title: 'Speed up the monorepo build cache',
    actions: [...edit('turbo.json', 'vite.config.ts', 'package.json'), ...run('pnpm build')],
  },
  { name: 'zh deploy', expect: 'platform', prompt: '部署到測試環境，容器映像要重新建置' },
  {
    name: 'docker compose',
    expect: 'platform',
    repo: 'infra-tools',
    actions: [...edit('docker-compose.yml'), ...run('docker compose up -d')],
  },
  {
    name: 'outage',
    expect: 'sre',
    title: 'Investigate production outage and add alerts',
    actions: [...run('kubectl logs deploy/api --tail=200'), ...tool('mcp__sentry__get_issue')],
  },
  {
    name: 'slo burn',
    expect: 'sre',
    prompt:
      'latency SLO is burning, check grafana dashboards and prometheus alerts and write the postmortem',
  },
  { name: 'zh incident', expect: 'sre', prompt: '昨晚有事故，監控告警一直響，要查原因並回滾' },
  {
    name: 'on-call oom',
    expect: 'sre',
    prompt: 'on-call: the worker pods are being OOM killed',
    actions: [...run('kubectl top pods')],
  },
  {
    name: 'cut a release',
    expect: 'release',
    title: 'Cut release 2.3 and bump version',
    actions: [
      ...edit('CHANGELOG.md', 'package.json'),
      ...run('git tag v2.3.0', 'npm publish --dry-run'),
    ],
  },
  {
    name: 'hotfix cherry-pick',
    expect: 'release',
    branch: 'hotfix/2.2.1',
    prompt: 'cherry-pick the fix onto the release branch and tag a patch',
    actions: [...run('git cherry-pick abc123', 'git tag v2.2.1')],
  },
  { name: 'zh release', expect: 'release', prompt: '準備發佈新版本，更新版本號與變更紀錄' },
  {
    name: 'changeset publish',
    expect: 'release',
    actions: [
      ...edit('.changeset/brave-owls.md'),
      ...run('pnpm changeset version', 'gh release create v1.4.0'),
    ],
  },
  {
    name: 'flaky e2e',
    expect: 'qa',
    title: 'Fix flaky Playwright e2e test',
    actions: [...edit('e2e/login.spec.ts'), ...run('npx playwright test e2e/login.spec.ts')],
  },
  {
    name: 'coverage gap',
    expect: 'qa',
    prompt: 'raise unit test coverage for the parser module',
    actions: [
      ...edit('tests/parser.test.ts', 'tests/lexer.test.ts'),
      ...run('vitest run --coverage'),
    ],
  },
  {
    name: 'pytest only',
    expect: 'qa',
    actions: [
      ...edit('tests/test_billing.py', 'tests/test_users.py', 'tests/conftest.py'),
      ...run('pytest -x'),
    ],
  },
  { name: 'zh qa', expect: 'qa', prompt: '補測試，回歸測試要涵蓋登入流程' },
  {
    name: 'test branch',
    expect: 'qa',
    branch: 'test/checkout-edge-cases',
    actions: [...edit('src/checkout/cart.spec.ts')],
  },
];
