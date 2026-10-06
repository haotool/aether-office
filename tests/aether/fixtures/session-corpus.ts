// A synthetic, labelled corpus of sessions: what each one was asked, where it ran and what it did, with the role a
// careful person would give it. Nothing here comes from a real session. Cases are written from how such work looks
// (file kinds, command families, branch names, subagent types), not from the classifier's own keyword lists.
export type ToolCall = { tool: string; target: string | null };
type CorpusCase = {
  name: string;
  expect: string;
  title?: string;
  prompt?: string;
  branch?: string;
  repo?: string;
  actions?: ToolCall[];
  subagents?: string[];
};

const edit = (...paths: string[]): ToolCall[] => paths.map((target) => ({ tool: 'Edit', target }));
const read = (...paths: string[]): ToolCall[] => paths.map((target) => ({ tool: 'Read', target }));
const run = (...commands: string[]): ToolCall[] =>
  commands.map((target) => ({ tool: 'Bash', target }));
const tool = (name: string, target: string | null = null): ToolCall[] => [{ tool: name, target }];

export const CORPUS: CorpusCase[] = [
  // Frontend
  {
    name: 'ui polish by title and files',
    expect: 'frontend',
    title: 'Polish the settings page spacing',
    branch: 'feat/ui-settings',
    actions: [
      ...edit('src/components/Settings.tsx', 'src/styles/settings.css'),
      ...run('pnpm vitest run'),
    ],
  },
  {
    name: 'css only, no words',
    expect: 'frontend',
    actions: [
      ...edit('web/src/app.css', 'web/src/theme.scss', 'web/src/Header.tsx', 'web/src/Footer.tsx'),
    ],
  },
  {
    name: 'responsive prompt',
    expect: 'frontend',
    prompt: 'make the navigation bar responsive on small screens and fix the dark mode colors',
  },
  { name: 'zh frontend', expect: 'frontend', prompt: '修正前端畫面樣式，按鈕對齊' },
  {
    name: 'react component work',
    expect: 'frontend',
    title: 'Extract a reusable Modal component',
    actions: [...edit('src/ui/Modal.tsx', 'src/ui/Modal.test.tsx', 'src/pages/Home.tsx')],
  },
  {
    name: 'figma handoff',
    expect: 'frontend',
    prompt: 'implement the new card design from the figma file',
    actions: [...tool('mcp__figma__get_design'), ...edit('src/components/Card.tsx')],
  },
  {
    name: 'accessibility pass',
    expect: 'frontend',
    prompt: 'audit keyboard focus and aria labels, fix accessibility issues in the dialog',
    actions: [...edit('app/ui/Dialog.tsx')],
  },
  {
    name: 'three.js scene',
    expect: 'frontend',
    title: 'Tune the three.js camera easing in the 3D scene',
    actions: [...edit('packages/scene/src/Camera.tsx')],
  },
  // Backend
  {
    name: 'rest endpoint',
    expect: 'backend',
    title: 'Add a REST endpoint for invoices',
    actions: [...edit('src/api/invoices.ts', 'src/services/invoice-service.ts')],
  },
  {
    name: 'route files only',
    expect: 'backend',
    actions: [
      ...edit(
        'server/routes/users.ts',
        'server/controllers/user.ts',
        'server/middleware/auth-check.ts',
      ),
    ],
    branch: 'fix/api-pagination',
  },
  {
    name: 'graphql resolver',
    expect: 'backend',
    prompt: 'the graphql resolver for orders returns null for deleted customers',
    actions: [...edit('src/resolvers/orders.ts')],
  },
  { name: 'zh backend', expect: 'backend', prompt: '後端 API 回傳格式要加上分頁，伺服器端處理' },
  {
    name: 'webhook handler',
    expect: 'backend',
    prompt: 'handle the stripe webhook retries and add idempotency to the handler',
    actions: [...edit('src/handlers/webhook.go'), ...run('curl -s localhost:8080/health')],
  },
  {
    name: 'go service with queue',
    expect: 'backend',
    title: 'Worker queue drops jobs under load',
    actions: [
      ...edit('internal/worker/queue.go', 'internal/service/jobs.go'),
      ...run('go test ./...'),
    ],
  },
  // Full-stack
  {
    name: 'full-stack feature',
    expect: 'fullstack',
    title: 'Ship the profile page end to end',
    actions: [
      ...edit('src/components/Profile.tsx', 'src/pages/profile.tsx', 'src/styles/profile.css'),
      ...edit(
        'server/routes/profile.ts',
        'server/services/profile.ts',
        'server/controllers/profile.ts',
      ),
    ],
  },
  { name: 'zh fullstack', expect: 'fullstack', prompt: '全端功能：新增收藏清單' },
  // Mobile
  {
    name: 'ios onboarding',
    expect: 'mobile',
    title: 'Build the iOS onboarding flow with Swift',
    actions: [...edit('ios/App/Onboarding.swift'), ...run('xcodebuild -scheme App test')],
  },
  {
    name: 'android gradle',
    expect: 'mobile',
    prompt: 'the android build fails after the gradle plugin bump',
    actions: [...edit('android/app/build.gradle'), ...run('./gradlew assembleDebug')],
  },
  {
    name: 'react native screens',
    expect: 'mobile',
    title: 'Fix the react native navigation crash on Android',
    actions: [...edit('mobile/src/screens/Home.tsx')],
  },
  { name: 'zh mobile', expect: 'mobile', prompt: '手機版的登入畫面閃退，iOS 與 Android 都要測' },
  {
    name: 'flutter',
    expect: 'mobile',
    repo: 'shop-mobile',
    prompt: 'add a pull to refresh to the flutter list',
    actions: [...edit('lib/screens/list.dart')],
  },
  // Database / data engineering
  {
    name: 'sql migration',
    expect: 'data',
    title: 'Write SQL migration for the orders schema',
    actions: [...edit('db/migrations/0042_orders.sql')],
  },
  {
    name: 'prisma schema',
    expect: 'data',
    prompt: 'add an index on the events table and update the prisma schema',
    actions: [...edit('prisma/schema.prisma'), ...run('npx prisma migrate dev')],
  },
  {
    name: 'etl job',
    expect: 'data',
    title: 'Nightly ETL into the warehouse is missing rows',
    actions: [...edit('pipelines/etl/load_orders.py'), ...run('dbt run --select orders')],
  },
  { name: 'zh database', expect: 'data', prompt: '資料庫遷移腳本要加上資料表索引' },
  {
    name: 'postgres tuning',
    expect: 'data',
    prompt: 'the postgres query on the reports table does a sequential scan',
    actions: [...run('psql -c "explain analyze select 1"')],
  },
  // Platform / devops / build tooling
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
  // SRE
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
  // Release
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
  // QA
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
  // Security
  {
    name: 'csrf and oauth',
    expect: 'security',
    title: 'Add OAuth token rotation and CSRF checks',
    actions: [...edit('src/auth/oauth.ts')],
  },
  {
    name: 'vuln sweep',
    expect: 'security',
    prompt: 'scan the dependencies for known CVEs and review the xss surface',
    actions: [...run('npm audit', 'semgrep --config auto .')],
  },
  { name: 'zh security', expect: 'security', prompt: '資安檢查：漏洞掃描與加密設定' },
  {
    name: 'secrets leak',
    expect: 'security',
    prompt:
      'a secret was committed to git history, rotate it and harden the pipeline against leaks',
    actions: [...run('gitleaks detect')],
  },
  {
    name: 'security reviewer subagent',
    expect: 'security',
    prompt: 'check this change',
    subagents: ['security-reviewer'],
    actions: [...read('src/auth/session.ts')],
  },
  // Code review
  {
    name: 'pr review',
    expect: 'review',
    title: 'Review PR 1234 for the billing service',
    actions: [...run('gh pr diff 1234', 'gh pr view 1234'), ...read('src/billing/charge.ts')],
  },
  {
    name: 'review comments',
    expect: 'review',
    prompt: 'go through the review comments on my branch and critique the diff',
    actions: [...run('git diff main...HEAD')],
  },
  { name: 'zh review', expect: 'review', prompt: '幫我審查這個 PR 的變更' },
  {
    name: 'code reviewer subagent',
    expect: 'review',
    prompt: 'look at what I just wrote',
    subagents: ['code-reviewer'],
  },
  // Data / ML / analytics
  {
    name: 'rag tuning',
    expect: 'ml',
    title: 'Tune the RAG retrieval and embeddings',
    actions: [...edit('src/retrieval/embed.py')],
  },
  {
    name: 'fine-tune',
    expect: 'ml',
    prompt: 'fine-tune the classifier on the new labeled dataset and compare eval loss',
    actions: [...run('python train.py --epochs 3'), ...edit('training/config.yaml')],
  },
  { name: 'zh ml', expect: 'ml', prompt: '機器學習模型訓練，向量資料庫換成新的嵌入' },
  {
    name: 'torch inference',
    expect: 'ml',
    actions: [
      ...edit('models/infer.py', 'models/export.py'),
      ...run('python -c "import torch; print(1)"'),
    ],
    prompt: 'speed up inference for the transformer',
  },
  {
    name: 'kpi dashboard',
    expect: 'analytics',
    title: 'Build a KPI dashboard for signups',
    actions: [...tool('mcp__amplitude__query')],
  },
  {
    name: 'pandas notebook',
    expect: 'analytics',
    prompt: 'analyze the churn csv and chart the monthly cohort retention',
    actions: [...edit('notebooks/churn.ipynb'), ...run('python analyze.py data/churn.csv')],
  },
  { name: 'zh analytics', expect: 'analytics', prompt: '產出本季數據分析報表與指標圖表' },
  // Architecture
  {
    name: 'refactor boundaries',
    expect: 'architect',
    title: 'Refactor the module boundaries and write an ADR',
    actions: [...edit('docs/adr/0007-boundaries.md')],
  },
  {
    name: 'rewrite plan mode',
    expect: 'architect',
    prompt: 'propose how to restructure the payment module, tech debt is high',
    actions: [...tool('ExitPlanMode'), ...read('src/payments/index.ts', 'src/payments/types.ts')],
  },
  { name: 'zh architect', expect: 'architect', prompt: '重構整體架構，收斂重複的模組並寫規格' },
  {
    name: 'plan subagent',
    expect: 'architect',
    prompt: 'how should we restructure the billing module, propose a design',
    subagents: ['Plan'],
  },
  {
    name: 'dedupe cleanup',
    expect: 'architect',
    prompt: 'deduplicate the three copies of the retry logic and simplify the abstraction',
    branch: 'refactor/retry',
  },
  // Docs
  {
    name: 'readme update',
    expect: 'docs',
    title: 'Update the README and the getting started guide',
    actions: [...edit('README.md', 'docs/getting-started.md')],
  },
  {
    name: 'docs only files',
    expect: 'docs',
    actions: [...edit('docs/api.md', 'docs/faq.md', 'docs/install.mdx')],
  },
  { name: 'zh docs', expect: 'docs', prompt: '補文件與教學，翻譯說明文字' },
  {
    name: 'docs branch',
    expect: 'docs',
    branch: 'docs/contributing',
    actions: [...edit('CONTRIBUTING.md')],
  },
  {
    name: 'doc updater subagent',
    expect: 'docs',
    prompt: 'sync the guides with the code',
    subagents: ['doc-updater'],
  },
  // Product management
  {
    name: 'roadmap',
    expect: 'product-manager',
    title: 'Plan the Q4 roadmap and prioritise the backlog',
    actions: [...tool('mcp__linear__list_issues')],
  },
  {
    name: 'prd',
    expect: 'product-manager',
    prompt:
      'draft the requirements for the notifications feature and set milestones for the sprint',
  },
  { name: 'zh pm', expect: 'product-manager', prompt: '整理需求與優先順序，排出里程碑與進度' },
  {
    name: 'triage tickets',
    expect: 'product-manager',
    prompt: 'triage the open tickets and estimate the backlog',
    actions: [...tool('mcp__jira__search')],
  },
  // Research / exploration
  {
    name: 'compare options',
    expect: 'research',
    title: 'Research and compare three vector databases',
    actions: [
      ...tool('WebSearch', 'vector database comparison'),
      ...tool('WebFetch', 'https://example.test/docs'),
    ],
  },
  {
    name: 'explore codebase read only',
    expect: 'research',
    prompt: 'how does the scheduler decide which job runs next, investigate',
    actions: [
      ...read('src/sched/a.ts', 'src/sched/b.ts', 'src/sched/c.ts'),
      ...tool('Grep', 'pick_next'),
      ...tool('Glob', 'src/**/*.ts'),
    ],
  },
  { name: 'zh research', expect: 'research', prompt: '調研業界的快取做法並比較優缺點' },
  {
    name: 'explore subagent',
    expect: 'research',
    prompt: 'investigate where retries are handled and how they back off',
    subagents: ['Explore'],
  },
  {
    name: 'feasibility spike',
    expect: 'research',
    prompt:
      'spike: is it feasible to stream the export instead of buffering, evaluate the memory cost',
  },
  // Git / release hygiene vs generalist
  {
    name: 'git housekeeping',
    expect: 'release',
    prompt: 'merge the feature branch, rebase onto main and tag the build',
    actions: [...run('git rebase main', 'git tag build-45', 'git merge --no-ff feat/x')],
  },
  // Subagent types as the session's own agent
  {
    name: 'build error resolver',
    expect: 'platform',
    prompt: 'the build is red, fix the typecheck errors in the pipeline',
    subagents: ['build-error-resolver'],
    actions: [...run('pnpm build')],
  },
  {
    name: 'tdd guide',
    expect: 'qa',
    prompt: 'write the failing test first',
    subagents: ['tdd-guide'],
    actions: [...edit('tests/feature.test.ts')],
  },
  // Headless / thin signals
  {
    name: 'headless codex review',
    expect: 'review',
    prompt: 'Review the following diff for bugs and style problems and report findings only',
  },
  {
    name: 'headless test run',
    expect: 'qa',
    prompt: 'run the full test suite and report failing tests',
    actions: [...run('npm test')],
  },
  // Honest generalist: no real signal
  { name: 'hello', expect: 'generalist', prompt: 'hello' },
  { name: 'continue', expect: 'generalist', prompt: 'continue' },
  { name: 'fix it', expect: 'generalist', prompt: 'fix it please' },
  { name: 'empty', expect: 'generalist' },
  {
    name: 'plain ts edits',
    expect: 'generalist',
    prompt: 'rename the variable and update the callers',
    actions: [...edit('src/util/a.ts', 'src/util/b.ts'), ...run('git status', 'ls')],
  },
  {
    name: 'main branch scratch',
    expect: 'generalist',
    branch: 'main',
    repo: 'scratch',
    title: 'quick question',
  },
  { name: 'thanks', expect: 'generalist', prompt: 'thanks, that worked' },
  {
    name: 'worktree agent branch',
    expect: 'generalist',
    branch: 'worktree-agent-ac3adf2161adf31b9',
    repo: 'notes',
  },
];
