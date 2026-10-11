// Five departments (one floor each) holding the roles industry teams commonly staff. Sources: public role descriptions
// for frontend, backend, mobile, platform, SRE, QA/SDET, security, data, ML and developer-relations engineers, and
// engineering management ladders.
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

type Department = {
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
