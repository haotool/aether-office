import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Control } from '../apps/control/src/control.js';
import { secret } from '../apps/control/src/services/identity.js';
import { enroll } from '../apps/control/src/services/runners.js';
export function setup(mode: 'demo' | 'live', directory: string) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const secretFile = resolve(directory, 'cursor-secret');
  if (!existsSync(secretFile)) writeFileSync(secretFile, secret(), { mode: 0o600, flag: 'wx' });
  const control = new Control(resolve(directory, 'control.sqlite'), {
    mode,
    cursorSecret: readFileSync(secretFile, 'utf8'),
  });
  try {
    const ownerFile = resolve(directory, 'owner-token');
    if (!control.ctx.sqlite.prepare('SELECT 1 FROM identities LIMIT 1').get()) {
      const owner = control.createIdentity(undefined, {
        name: 'Local owner',
        role: 'owner',
        projectIds: ['*'],
      });
      writeFileSync(ownerFile, owner.token, { mode: 0o600, flag: 'wx' });
    }
    const owner = control.authenticate(readFileSync(ownerFile, 'utf8').trim());
    if (mode === 'demo' && !control.listProjects(owner).length) {
      const cmd = (type: string, data: unknown, key: string, projectId?: string) =>
        control.execute(owner, {
          schemaVersion: 1,
          type,
          data,
          idempotencyKey: `seed-v1-${key}`,
          correlationId: 'a0000000-0000-4000-8000-000000000001',
          ...(projectId ? { projectId } : {}),
        });
      const projectId = String(
        cmd('project.create', { name: 'AETHER · 軌道研究室' }, 'project').result['id'],
      );
      const people = [
        ['Atlas', 'fox', 'coordinator', '#d39b6c'],
        ['Mika', 'rabbit', 'engineer', '#8bbac0'],
        ['Nova', 'panda', 'reviewer', '#99b1a2'],
        ['Sora', 'cat', 'engineer', '#a09bc9'],
        ['Koda', 'dog', 'engineer', '#c5a478'],
        ['Rin', 'raccoon', 'reviewer', '#9cabb6'],
        ['Otto', 'otter', 'engineer', '#b5a089'],
        ['Bram', 'bear', 'engineer', '#aa8c79'],
        ['Luna', 'rabbit', 'observer', '#b8b8d2'],
        ['Kai', 'fox', 'engineer', '#c1957e'],
        ['Yuki', 'cat', 'engineer', '#7bb5b3'],
        ['Nori', 'panda', 'reviewer', '#88a6bc'],
      ];
      for (const [name, species, role, color] of people)
        cmd(
          'agent.register',
          { name, species, role, provider: 'demo', color },
          `agent-${name}`,
          projectId,
        );
      cmd(
        'work.create',
        {
          title: '驗證第一條工作流程',
          description:
            '將這份示範任務派給一位成員。獨立執行主機將啟動真實 fixture 程序，並回報結果。',
          acceptance: '確認狀態經過已派工、執行中、待審查；不將 fixture 說成真實模型。',
          priority: 2,
          dependencies: [],
        },
        'task-1',
        projectId,
      );
      cmd(
        'work.create',
        {
          title: '檢查辦公室動線',
          description: '選擇不同桌位，檢查相機、角色與辦公桌的位置。',
          acceptance: '記錄實際觀察與需要調整的物件。',
          priority: 1,
          dependencies: [],
        },
        'task-2',
        projectId,
      );
    }
    const projects = control.listProjects(owner);
    if (projects.length && !existsSync(resolve(directory, 'runner-token'))) {
      const runner = enroll(
        control.ctx,
        owner,
        mode === 'demo' ? 'Local · Demo runner' : 'Local runner',
        projects.map((p) => p.id),
      );
      writeFileSync(resolve(directory, 'runner-token'), runner.token, { mode: 0o600, flag: 'wx' });
    }
    return { ownerFile, projects: projects.length };
  } finally {
    control.close();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const mode = process.argv.includes('--demo') ? 'demo' : 'live';
  const dir = resolve(process.env['AETHER_DATA_DIR'] ?? `.data/${mode}`);
  const result = setup(mode, dir);
  console.log(`Setup ready. ${result.projects} project(s). Owner token file: ${result.ownerFile}`);
}
