// Cases for product-facing and data work: UI, backend, mobile and databases.
import { type CorpusCase, edit, run, tool } from './corpus-types.js';

export const PRODUCT: CorpusCase[] = [
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
];
