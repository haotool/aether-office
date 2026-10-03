// The engineering organisation the office is built around: five departments (one floor each) holding the roles
// industry teams commonly staff. Sources: public role descriptions for frontend, backend, mobile, platform, SRE, QA/SDET,
// security, data, ML and developer-relations engineers, and engineering management / staff ladders.
export type DepartmentId = 'product' | 'platform' | 'quality' | 'data' | 'leadership';
export type RoleId =
  | 'frontend'
  | 'backend'
  | 'fullstack'
  | 'mobile'
  | 'platform'
  | 'sre'
  | 'release'
  | 'qa'
  | 'security'
  | 'review'
  | 'data'
  | 'ml'
  | 'analytics'
  | 'architect'
  | 'docs'
  | 'product-manager'
  | 'research'
  | 'generalist';

export type Department = {
  id: DepartmentId;
  floor: number;
  en: string;
  zh: string;
  accent: string;
  roles: readonly RoleId[];
};
export const DEPARTMENTS: readonly Department[] = [
  {
    id: 'product',
    floor: 0,
    en: 'Product Engineering',
    zh: '產品工程',
    accent: '#4fd1c5',
    roles: ['frontend', 'backend', 'fullstack', 'mobile', 'generalist'],
  },
  {
    id: 'platform',
    floor: 1,
    en: 'Platform & Reliability',
    zh: '平台與可靠性',
    accent: '#f6ad55',
    roles: ['platform', 'sre', 'release'],
  },
  {
    id: 'quality',
    floor: 2,
    en: 'Quality & Security',
    zh: '品質與資安',
    accent: '#fc8181',
    roles: ['qa', 'security', 'review'],
  },
  {
    id: 'data',
    floor: 3,
    en: 'Data & AI',
    zh: '資料與 AI',
    accent: '#b794f4',
    roles: ['data', 'ml', 'analytics'],
  },
  {
    id: 'leadership',
    floor: 4,
    en: 'Leadership & Developer Experience',
    zh: '領導與開發者體驗',
    accent: '#63b3ed',
    roles: ['architect', 'docs', 'product-manager', 'research'],
  },
];

export const ROLE_LABELS: Record<RoleId, { en: string; zh: string; department: DepartmentId }> = {
  frontend: { en: 'Frontend Engineer', zh: '前端工程師', department: 'product' },
  backend: { en: 'Backend Engineer', zh: '後端工程師', department: 'product' },
  fullstack: { en: 'Full-stack Engineer', zh: '全端工程師', department: 'product' },
  mobile: { en: 'Mobile Engineer', zh: '行動裝置工程師', department: 'product' },
  generalist: { en: 'Software Engineer', zh: '軟體工程師', department: 'product' },
  platform: { en: 'Platform / DevOps Engineer', zh: '平台／DevOps 工程師', department: 'platform' },
  sre: { en: 'Site Reliability Engineer', zh: '網站可靠性工程師', department: 'platform' },
  release: { en: 'Release Engineer', zh: '發佈工程師', department: 'platform' },
  qa: { en: 'QA / SDET', zh: '測試工程師', department: 'quality' },
  security: { en: 'Security Engineer', zh: '資安工程師', department: 'quality' },
  review: { en: 'Code Reviewer', zh: '程式碼審查', department: 'quality' },
  data: { en: 'Data Engineer', zh: '資料工程師', department: 'data' },
  ml: { en: 'ML / AI Engineer', zh: '機器學習／AI 工程師', department: 'data' },
  analytics: { en: 'Data Analyst', zh: '資料分析', department: 'data' },
  architect: { en: 'Staff / Architect', zh: '資深／架構師', department: 'leadership' },
  docs: { en: 'Docs / Developer Relations', zh: '文件／開發者關係', department: 'leadership' },
  'product-manager': {
    en: 'Product / Project Manager',
    zh: '產品／專案管理',
    department: 'leadership',
  },
  research: { en: 'Research & Planning', zh: '研究與規劃', department: 'leadership' },
};

// Ordered: the first role whose pattern matches wins, so the narrow specialities come before the broad ones.
const RULES: readonly (readonly [RoleId, RegExp])[] = [
  [
    'security',
    /\b(security|vuln\w*|cve|auth(?:n|z|entication|orization)?|oauth|csrf|xss|ssrf|secret|pentest|threat|harden)\b|資安|安全|漏洞|授權|認證/i,
  ],
  ['review', /\b(review|code[- ]?review|audit|critique|lgtm|pr[- ]?review)\b|審查|審核|檢視/i],
  [
    'mobile',
    /\b(ios|android|swift|kotlin|react native|expo|flutter|mobile|app store)\b|行動|手機/i,
  ],
  [
    'platform',
    /\b(ci|cd|ci\/cd|pipeline|docker\w*|k8s|kubernetes|helm|terraform|infra\w*|devops|deploy\w*|github actions|workflow|build|bazel|vite config|tooling|monorepo|pnpm)\b|部署|建置|基礎設施|流水線/i,
  ],
  [
    'qa',
    /\b(test|tests|testing|qa|sdet|e2e|playwright|vitest|jest|pytest|coverage|flaky|regression|bug|fix(?:es)? failing)\b|測試|驗證|回歸|除錯/i,
  ],
  [
    'sre',
    /\b(sre|incident|outage|on-?call|monitor\w*|observab\w*|alert\w*|latency|slo|sla|reliab\w*|oom|crash|postmortem|rollback)\b|事故|監控|可靠|當機|效能/i,
  ],
  [
    'release',
    /\b(release|changelog|version(?:ing)?|bump|publish|tag|semver|hotfix|cherry-?pick|merge queue|integrate)\b|發佈|版本|合併/i,
  ],
  [
    'ml',
    /\b(ml|ai|llm|model|prompt|embedding|rag|agent|training|finetun\w*|inference|openai|anthropic|claude|codex|gpt)\b|模型|機器學習|提示/i,
  ],
  [
    'data',
    /\b(data|etl|pipeline|warehouse|sql|schema|migration|database|db|sqlite|postgres|index|query|dbt|spark)\b|資料|資料庫|遷移|查詢/i,
  ],
  [
    'analytics',
    /\b(analytics|dashboard|metric\w*|report\w*|chart|kpi|telemetry|usage)\b|報表|分析|指標|儀表/i,
  ],
  [
    'frontend',
    /\b(frontend|front-end|ui|ux|css|tailwind|react|vue|svelte|component|page|layout|style|three\.?js|3d|canvas|a11y|accessib\w*|responsive|html)\b|前端|介面|畫面|樣式|版面|無障礙/i,
  ],
  [
    'backend',
    /\b(backend|back-end|api|server|endpoint|route|service|rest|graphql|grpc|queue|worker|fastify|express|django|rails|auth service)\b|後端|伺服器|介面服務/i,
  ],
  [
    'docs',
    /\b(docs?|documentation|readme|guide|tutorial|blog|devrel|changelog entry|comment)\b|文件|說明|教學/i,
  ],
  [
    'architect',
    /\b(architect\w*|design|refactor\w*|rfc|adr|spec|proposal|cleanup|clean[- ]?code|migrate|rewrite|tech debt)\b|架構|設計|重構|規格|收斂/i,
  ],
  [
    'product-manager',
    /\b(plan|roadmap|prd|backlog|prioriti\w*|requirements?|milestone|sprint|triage|issue|ticket|estimate)\b|規劃|需求|排程|優先|里程碑/i,
  ],
  [
    'research',
    /\b(research|investigate|explore|survey|compare|evaluate|benchmark|analy[sz]e|study)\b|調研|研究|評估|比較|調查/i,
  ],
  ['fullstack', /\b(full-?stack|end-to-end feature)\b|全端/i],
];

export type Classification = {
  role: RoleId;
  department: DepartmentId;
  /** What the decision rests on, so a guess is never presented as a fact. */
  basis: 'title' | 'prompt' | 'context' | 'default';
  matched: string | null;
};

/** Pure. Classifies from the session's title, then what it was asked to do, then its branch and repository; otherwise a generalist. */
export function classifySession(input: {
  title?: string | null;
  /** What the session was asked to do. Used to decide, never kept. */
  prompt?: string | null;
  branch?: string | null;
  repo?: string | null;
}): Classification {
  const tries: [Classification['basis'], string | null | undefined][] = [
    ['title', input.title],
    ['prompt', input.prompt],
    ['context', [input.branch, input.repo].filter(Boolean).join(' ')],
  ];
  for (const [basis, text] of tries) {
    if (!text) continue;
    for (const [role, pattern] of RULES) {
      const match = pattern.exec(text);
      if (match)
        return {
          role,
          department: ROLE_LABELS[role].department,
          basis,
          matched: match[0].toLowerCase(),
        };
    }
  }
  return { role: 'generalist', department: 'product', basis: 'default', matched: null };
}
