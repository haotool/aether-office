import type { Key } from '../../lib/i18n/i18n.js';
import type { SectionId } from './sections.js';

export const ENTRIES = [
  {
    id: 'language',
    section: 'general',
    label: 'language',
    desc: 'stLanguageDesc',
    words: 'locale 中文 english',
  },
  {
    id: 'theme',
    section: 'general',
    label: 'appearance',
    desc: 'stThemeDesc',
    words: 'theme dark light system mode 主題 深色 淺色 系統',
  },
  {
    id: 'motion',
    section: 'general',
    label: 'motion',
    desc: 'stMotionDesc',
    words: 'animation reduced 動畫',
  },
  {
    id: 'quality',
    section: 'general',
    label: 'quality',
    desc: 'stQualityDesc',
    words: 'graphics performance battery 效能 省電',
  },
  {
    id: 'notify',
    section: 'notifications',
    label: 'notifyAlerts',
    desc: 'notifyHint',
    words: 'alert permission browser 提醒 權限',
  },
  {
    id: 'remote',
    section: 'notifications',
    label: 'remoteApprovalsToggle',
    desc: 'stRemoteDesc',
    words: 'approve allow deny hook lan https 核准 允許 拒絕',
  },
  {
    id: 'pairing',
    section: 'connections',
    label: 'pairOpen',
    desc: 'pairHint',
    words: 'qr phone lan pair 配對 手機',
  },
  {
    id: 'install',
    section: 'connections',
    label: 'stInstallLabel',
    desc: 'stInstallDesc',
    words: 'pwa app home screen 主畫面',
  },
  {
    id: 'address',
    section: 'connections',
    label: 'stAddressLabel',
    desc: 'stAddressDesc',
    words: 'https secure tls tailscale localhost 安全',
  },
  {
    id: 'models',
    section: 'models',
    label: 'modelsDetected',
    desc: 'modelsNote',
    words: 'claude codex cli opus sonnet gpt effort 模型',
  },
  {
    id: 'local',
    section: 'models',
    label: 'stLocalLabel',
    desc: 'stLocalDesc',
    words: 'AETHER_LOCAL_SESSIONS env discovery 環境變數',
  },
  {
    id: 'execution',
    section: 'models',
    label: 'executionPolicy',
    desc: 'executionConsent',
    words: 'live turns timeout policy 執行 逾時',
  },
  {
    id: 'cli',
    section: 'models',
    label: 'stCliLabel',
    desc: 'stCliDesc',
    words: 'doctor hooks install status pnpm terminal command 指令 檢查',
  },
  {
    id: 'view',
    section: 'office',
    label: 'stViewLabel',
    desc: 'stViewDesc',
    words: '2d 3d list scene 列表 空間',
  },
  {
    id: 'camera',
    section: 'office',
    label: 'stCameraLabel',
    desc: 'stCameraDesc',
    words: 'director auto camera 導演 運鏡',
  },
  {
    id: 'beanstalk',
    section: 'office',
    label: 'beanstalk',
    desc: 'stBeanstalkDesc',
    words: 'garden tree 花園 豆莖',
  },
  {
    id: 'lifeCalm',
    section: 'office',
    label: 'stLifeCalmLabel',
    desc: 'stLifeCalmDesc',
    words: 'calm animation motion meme quiet 平靜 動畫 安靜',
  },
  {
    id: 'lifeRelation',
    section: 'office',
    label: 'stLifeRelationLabel',
    desc: 'stLifeRelationDesc',
    words: 'squad subagent beam zone 小隊 子代理 光束',
  },
  {
    id: 'lifeKinds',
    section: 'office',
    label: 'stLifeKindsLabel',
    desc: 'stLifeKindsDesc',
    words: 'animation effects memes easter eggs tests ops wellbeing social 動畫 彩蛋 梗',
  },
  {
    id: 'lifeFrequency',
    section: 'office',
    label: 'stLifeFrequencyLabel',
    desc: 'stLifeFrequencyDesc',
    words: 'rare often meme frequency 頻率 少見',
  },
  {
    id: 'intro',
    section: 'office',
    label: 'stIntroLabel',
    desc: 'stIntroDesc',
    words: 'tour welcome first visit orbit replay 導覽 開場 首次',
  },
  {
    id: 'introReplay',
    section: 'office',
    label: 'stIntroReplayLabel',
    desc: 'stIntroReplayDesc',
    words: 'tour replay again intro welcome orbit 重播 導覽 開場',
  },
  {
    id: 'advanced',
    section: 'advanced',
    label: 'advancedTitle',
    desc: 'advancedHint',
    words: 'tasks review orchestration 任務 審查',
  },
  {
    id: 'schedules',
    section: 'advanced',
    label: 'schedules',
    desc: 'stSchedulesDesc',
    words: 'cron daily weekly 每日 每週',
  },
  {
    id: 'a2a',
    section: 'advanced',
    label: 'stA2aLabel',
    desc: 'stA2aDesc',
    words: 'agent gateway credential token 憑證',
  },
  {
    id: 'integrations',
    section: 'advanced',
    label: 'integrations',
    desc: 'stIntegrationsDesc',
    words: 'webhook sync 同步',
  },
  {
    id: 'hosts',
    section: 'advanced',
    label: 'stHostsLabel',
    desc: 'stHostsDesc',
    words: 'machines runner workspace 工作區 主機',
  },
  {
    id: 'storage',
    section: 'data',
    label: 'stStorageLabel',
    desc: 'stStorageDesc',
    words: 'privacy cookie localstorage sqlite 隱私 儲存',
  },
  {
    id: 'prefs',
    section: 'data',
    label: 'stPrefsLabel',
    desc: 'stPrefsDesc',
    words: 'export reset clear backup 匯出 重設 清除',
  },
  {
    id: 'signout',
    section: 'data',
    label: 'logout',
    desc: 'stSignOutDesc',
    words: 'logout session token 登出',
  },
  {
    id: 'version',
    section: 'about',
    label: 'stVersionLabel',
    desc: 'stVersionDesc',
    words: 'build mode demo live release 版本',
  },
  {
    id: 'shortcuts',
    section: 'about',
    label: 'stShortcutsLabel',
    desc: 'stShortcutsDesc',
    words: 'keyboard keys hotkey cheat sheet 鍵盤 快捷鍵',
  },
  {
    id: 'links',
    section: 'about',
    label: 'stLinksLabel',
    desc: 'stLinksDesc',
    words: 'license notices docs source 授權 文件',
  },
] as const satisfies readonly {
  id: string;
  section: SectionId;
  label: Key;
  desc: Key;
  words: string;
}[];

export type EntryId = (typeof ENTRIES)[number]['id'];
type Entry = (typeof ENTRIES)[number];

export const entryOf = (id: EntryId): Entry => {
  const entry = ENTRIES.find((row) => row.id === id);
  if (!entry) throw new Error(`unknown settings entry: ${id}`);
  return entry;
};
