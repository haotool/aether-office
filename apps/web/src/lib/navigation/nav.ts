import {
  Building2,
  UsersRound,
  ListTodo,
  MessagesSquare,
  ShieldCheck,
  BookOpen,
  Server,
  History as HistoryIcon,
  Settings2,
  Radio,
  Layers,
  Monitor,
  CheckCheck,
} from 'lucide-react';

export const nav = [
  ['office', Building2],
  ['agents', UsersRound],
  ['tasks', ListTodo],
  ['messages', MessagesSquare],
  ['workspace', Monitor],
  ['terminals', Monitor],
  ['sessions', Layers],
  ['observations', Radio],
  ['reviews', ShieldCheck],
  ['approvals', CheckCheck],
  ['knowledge', BookOpen],
  ['machines', Server],
  ['history', HistoryIcon],
  ['settings', Settings2],
] as const;

const navGroups = [
  ['groupWork', ['office', 'agents', 'tasks', 'messages']],
  ['groupWatch', ['reviews', 'approvals', 'sessions', 'observations']],
  ['groupSystem', ['workspace', 'terminals', 'knowledge', 'machines', 'history', 'settings']],
] as const;

const ADVANCED_PAGES: ReadonlySet<string> = new Set([
  'agents',
  'tasks',
  'messages',
  'workspace',
  'reviews',
  'knowledge',
  'machines',
  'observations',
]);

export const visibleNav = (advanced: boolean) =>
  nav.filter(([key]) => advanced || !ADVANCED_PAGES.has(key));

export const visibleGroups = (advanced: boolean) =>
  navGroups
    .map(
      ([group, pages]) => [group, pages.filter((p) => advanced || !ADVANCED_PAGES.has(p))] as const,
    )
    .filter(([, pages]) => pages.length > 0);

export const tabPages = (advanced: boolean) =>
  advanced
    ? (['office', 'sessions', 'tasks', 'messages'] as const)
    : (['office', 'sessions', 'approvals', 'terminals'] as const);

export const pageLink = (page: string, projectId: string | undefined) =>
  `/${page}${projectId ? `?project=${projectId}` : ''}`;

export const isPage = (page: string) => nav.some(([key]) => key === page);
