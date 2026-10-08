// Cases for security, review, data science, architecture and docs.
import { type CorpusCase, edit, read, run, tool } from './corpus-types.js';

export const ASSURANCE: CorpusCase[] = [
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
];
