import type { RoleId } from './departments.js';

type WordRule = readonly [RoleId, 1 | 2, RegExp];

export const WORDS: readonly WordRule[] = [
  [
    'frontend',
    2,
    /\b(?:frontend|front-end|ui|ux|css|scss|tailwind|react(?! native)|vue|svelte|jsx|tsx|components?|storybook|a11y|accessib\w*|aria|responsive|figma|webgl|three\.?js|html)\b|前端|介面|畫面|樣式|版面|無障礙|元件|按鈕|動畫/i,
  ],
  [
    'frontend',
    1,
    /\b(?:pages?|layout|styles?|canvas|modal|buttons?|animations?|theme|dark mode|icons?|navigation bar|3d)\b/i,
  ],
  [
    'backend',
    2,
    /\b(?:backend|back-end|api|apis|endpoints?|rest(?: api| endpoint)s?|restful|graphql|grpc|fastify|express\.js|django|flask|rails|spring boot|controllers?|middleware|webhooks?|resolvers?)\b|後端|伺服器|接口/i,
  ],
  [
    'backend',
    1,
    /\b(?:server|routes?|services?|queues?|workers?|handlers?|cron|rate.?limit\w*|idempoten\w*)\b/i,
  ],
  ['fullstack', 2, /\b(?:full-?stack)\b|全端/i],
  [
    'mobile',
    2,
    /\b(?:ios|android|swift|swiftui|kotlin|react native|expo|flutter|xcode|gradle|testflight|app store|play store|mobile)\b|手機|行動裝置|行動版/i,
  ],
  [
    'platform',
    2,
    /\b(?:ci|ci\/cd|ci-cd|cicd|pipelines?|docker\w*|kubernetes|k8s|helm|terraform|ansible|infra\w*|devops|github actions|nginx|vercel|cloudflare|aws|gcp|azure|deploy\w*|bazel|turborepo|containers?)\b|部署|建置|基礎設施|流水線|容器/i,
  ],
  [
    'platform',
    1,
    /\b(?:build|bundl\w*|webpack|vite|esbuild|tooling|monorepo|pnpm|npm|lint|eslint|config|workflows?)\b/i,
  ],
  [
    'sre',
    2,
    /\b(?:sre|incidents?|outages?|on-?call|monitor\w*|observab\w*|alerts?|alerting|latency|slo|sla|postmortem|rollback|oom|prometheus|grafana|sentry|datadog)\b|事故|監控|當機|告警|可靠性|回滾/i,
  ],
  ['sre', 1, /\b(?:crash\w*|performance|slow|timeouts?|profil\w*|memory leak)\b|效能/i],
  [
    'release',
    2,
    /\b(?:releases?|changelog|semver|bump|publish\w*|hotfix|cherry-?pick|versioning)\b|發佈|版本號|變更紀錄|上線/i,
  ],
  ['release', 1, /\b(?:merge|rebase|integrate|tags?)\b|合併/i],
  [
    'qa',
    2,
    /\b(?:tests?|testing|qa|sdet|e2e|playwright|cypress|vitest|jest|pytest|junit|coverage|flaky|regressions?|snapshots?|mocks?)\b|測試|回歸|覆蓋率/i,
  ],
  ['qa', 1, /\b(?:bugs?|failing|verify|validate|repro\w*)\b|除錯|驗證/i],
  [
    'security',
    2,
    /\b(?:security|vulnerab\w*|cves?|owasp|csrf|xss|ssrf|injection|pentest|threat model|secrets?|oauth|jwt|sanitiz\w*|harden\w*|encrypt\w*)\b|資安|漏洞|安全|加密/i,
  ],
  ['security', 1, /\b(?:auth\w*|permissions?|tokens?|credentials?)\b|認證|授權|權限/i],
  [
    'review',
    2,
    /\b(?:code[- ]?review|reviews?|pr[- ]?review|audit|critique|lgtm)\b|審查|審核|檢視/i,
  ],
  [
    'data',
    2,
    /\b(?:etl|elt|warehouse|sql|schemas?|migrations?|databases?|postgres\w*|mysql|sqlite|mongo\w*|redis|dbt|spark|airflow|orm|prisma|drizzle|alembic|indexes|indices)\b|資料庫|遷移|資料表|資料管線/i,
  ],
  ['data', 1, /\b(?:data|queries|query|tables?)\b|資料|查詢/i],
  [
    'ml',
    2,
    /\b(?:ml|machine learning|llm|embeddings?|rag|fine-?tun\w*|inference|training|pytorch|torch|tensorflow|transformers?|vector (?:db|database|store)s?|datasets?)\b|模型訓練|機器學習|向量|深度學習|微調|嵌入/i,
  ],
  ['ml', 1, /\b(?:model|models|prompts?|neural|gpu|eval|evals)\b/i],
  [
    'analytics',
    2,
    /\b(?:analytics|dashboards?|metrics?|kpis?|funnels?|cohorts?|pandas|jupyter|notebooks?|visuali[sz]ations?|charts?|csv)\b|報表|數據分析|指標|儀表|統計|圖表/i,
  ],
  ['analytics', 1, /\b(?:reports?|stats|trends?|excel)\b/i],
  [
    'architect',
    2,
    /\b(?:architect\w*|rfc|adr|system design|design doc|refactor\w*|tech debt|module boundar\w*|rewrite|clean-?code|ssot|dedup\w*|deduplicate)\b|架構|重構|規格|收斂|模組|技術債/i,
  ],
  [
    'architect',
    1,
    /\b(?:design|spec|cleanup|simplif\w*|restructure|proposals?|propose|abstractions?|migrate)\b|設計/i,
  ],
  [
    'docs',
    2,
    /\b(?:docs?|documentation|readme|tutorials?|guides?|blog|devrel|jsdoc|typedoc|translat\w*)\b|文件|說明|教學|翻譯|文案/i,
  ],
  ['docs', 1, /\b(?:comments?|wording|write-?up)\b|註解/i],
  [
    'product-manager',
    2,
    /\b(?:roadmap|prd|backlog|prioriti[sz]\w*|requirements?|milestones?|sprints?|triage|user stor\w+|okrs?|stakeholders?|pm|project manage\w*)\b|專案進度|規劃|需求|排程|優先|里程碑|專案管理|待辦/i,
  ],
  ['product-manager', 1, /\b(?:plan|tickets?|estimate\w*|status update|progress)\b|進度/i],
  [
    'research',
    2,
    /\b(?:research|investigat\w*|explor\w*|survey|compare|evaluate|benchmark\w*|feasib\w*|poc|spike|how does|why does)\b|調研|研究|評估|比較|調查|探索/i,
  ],
  ['research', 1, /\b(?:analy[sz]e|study|find out|look into|understand)\b|分析|了解|原因/i],
];

type PathRule = readonly [RoleId, number, RegExp, string];
export const PATHS: readonly PathRule[] = [
  [
    'qa',
    1.2,
    /(?:^|\/)(?:tests?|__tests__|e2e|cypress|playwright|specs?)\/|\.(?:test|spec)\.[cm]?[jt]sx?$|_test\.(?:go|py)$|(?:^|\/)test_[^/]*\.py$/i,
    'tests',
  ],
  [
    'platform',
    1.2,
    /(?:^|\/)(?:\.github\/workflows|\.gitlab-ci|\.circleci|infra|terraform|k8s|helm|deploy|ansible)\/|(?:^|\/)(?:Dockerfile|docker-compose[^/]*|\.gitlab-ci\.yml)$|\.(?:tf|tfvars)$/i,
    'infra/CI files',
  ],
  [
    'platform',
    0.6,
    /(?:^|\/)(?:turbo\.json|vite\.config[^/]*|webpack\.config[^/]*|package\.json|pnpm-workspace\.yaml|Makefile|Cargo\.toml|rollup\.config[^/]*)$/i,
    'build config',
  ],
  [
    'release',
    1.2,
    /(?:^|\/)(?:CHANGELOG[^/]*|RELEASE[^/]*|\.changeset\/[^/]*)$/i,
    'changelog/release files',
  ],
  [
    'data',
    1.5,
    /(?:^|\/)(?:migrations?|db|database|schema|seeds?|sql)\/|\.(?:sql|prisma)$/i,
    'database files',
  ],
  ['analytics', 1, /\.(?:ipynb|csv)$/i, 'notebooks/csv'],
  [
    'ml',
    1,
    /(?:^|\/)(?:training|embeddings?|ml)\/|(?:^|\/)(?:train|infer|finetune)[^/]*\.py$/i,
    'ml code',
  ],
  [
    'mobile',
    1.5,
    /\.(?:swift|kt|kts|dart|xcodeproj|pbxproj|plist|gradle)$|(?:^|\/)(?:ios|android|mobile)\//i,
    'mobile code',
  ],
  ['architect', 1, /(?:^|\/)(?:adr|rfcs?)\/|(?:^|\/)ARCHITECTURE[^/]*$/i, 'ADR/RFC'],
  ['docs', 1, /(?:^|\/)(?:docs?|documentation)\/|\.(?:md|mdx|rst)$/i, 'docs'],
  [
    'security',
    1,
    /(?:^|\/)(?:auth|security|crypto|permissions?|acl)(?:\/|\.)/i,
    'auth/security code',
  ],
  [
    'backend',
    1.2,
    /(?:^|\/)(?:api|routes?|controllers?|services?|server|handlers?|middleware|backend|resolvers|internal)\//i,
    'server code',
  ],
  ['backend', 0.5, /\.(?:go|java|rb|php|cs)$/i, 'server-language code'],
  [
    'frontend',
    1.2,
    /(?:^|\/)(?:components?|pages?|ui|views|styles|frontend|web|public)\/|\.(?:tsx|jsx|vue|svelte|css|scss|less|html|astro)$/i,
    'UI code',
  ],
];

type CommandRule = readonly [RoleId, number, RegExp, string];
export const COMMANDS: readonly CommandRule[] = [
  [
    'release',
    1.5,
    /\b(?:git tag|git cherry-pick|gh release|npm publish|pnpm publish|changeset|git push --tags|npm version)\b/,
    'release commands',
  ],
  ['review', 1, /\bgh pr (?:diff|review|view)\b/, 'pr review commands'],
  [
    'security',
    1.5,
    /\b(?:npm audit|pnpm audit|semgrep|trivy|snyk|gitleaks|nmap|openssl|bandit)\b/,
    'security scanners',
  ],
  [
    'platform',
    1.2,
    /\b(?:docker|docker-compose|kubectl|helm|terraform|ansible|gcloud|aws|wrangler|flyctl|vercel)\b/,
    'infra commands',
  ],
  [
    'sre',
    0.8,
    /\b(?:kubectl (?:logs|top)|journalctl|systemctl|htop|tcpdump|strace)\b/,
    'ops commands',
  ],
  [
    'data',
    1.2,
    /\b(?:psql|mysql|sqlite3|alembic|prisma|knex|dbt|airflow|pg_dump)\b/,
    'database commands',
  ],
  [
    'mobile',
    1.5,
    /\b(?:xcodebuild|xcrun|simctl|gradlew|adb|pod install|flutter|expo)\b/,
    'mobile toolchain',
  ],
  [
    'ml',
    1.2,
    /\b(?:torch|accelerate|huggingface|wandb|tensorboard|transformers)\b/,
    'ml toolchain',
  ],
  ['analytics', 1, /\b(?:jupyter|nbconvert|pandas|matplotlib)\b/, 'analysis tools'],
  [
    'qa',
    0.25,
    /\b(?:vitest|jest|pytest|playwright|cypress|mocha|go test|cargo test|npm test|pnpm test|npm run test|rspec)\b/,
    'test runs',
  ],
  [
    'platform',
    0.25,
    /\b(?:pnpm build|npm run build|vite build|webpack|esbuild|turbo)\b/,
    'build runs',
  ],
  ['backend', 0.4, /\bcurl\b[^|]*(?:localhost|127\.0\.0\.1)/, 'api calls'],
];

const SUBAGENTS: readonly (readonly [RegExp, RoleId])[] = [
  [/security/i, 'security'],
  [/review/i, 'review'],
  [/tdd|e2e|\bqa\b|test/i, 'qa'],
  [/build|devops|deploy|infra/i, 'platform'],
  [/doc/i, 'docs'],
  [/^plan|architect/i, 'architect'],
  [/refactor|clean/i, 'architect'],
  [/explor|research|search|guide/i, 'research'],
  [/data|sql|database/i, 'data'],
];

export const roleOfSubagent = (type: string): RoleId | null =>
  SUBAGENTS.find(([pattern]) => pattern.test(type))?.[1] ?? null;

export const TOOLS: readonly (readonly [RegExp, RoleId, number, string])[] = [
  [/^ExitPlanMode$/, 'architect', 1.5, 'plan mode'],
  [/^(?:WebSearch|WebFetch)$/, 'research', 0.6, 'web lookups'],
  [/^(?:SendMessage|ListAgents|SendUserFile)$/, 'product-manager', 1, 'coordinating agents'],
  [/^(?:Agent|Task)$/, 'product-manager', 0.5, 'delegating work'],
  [/^mcp__.*figma/i, 'frontend', 1.5, 'figma'],
  [/^mcp__.*(?:linear|jira|asana|notion|atlassian)/i, 'product-manager', 1.2, 'ticket tracker'],
  [/^mcp__.*(?:sentry|datadog|grafana|pagerduty)/i, 'sre', 1.5, 'monitoring tools'],
  [/^mcp__.*(?:bigquery|amplitude|hex|mixpanel|looker)/i, 'analytics', 1.5, 'analytics tools'],
  [/^mcp__.*cloudflare/i, 'platform', 1.2, 'cloud tools'],
];
