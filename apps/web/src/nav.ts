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

/** The pages by what a person comes for: doing the work, keeping watch, looking after the system. */
const navGroups = [
  ['groupWork', ['office', 'agents', 'tasks', 'messages']],
  ['groupWatch', ['reviews', 'approvals', 'sessions', 'observations']],
  ['groupSystem', ['workspace', 'terminals', 'knowledge', 'machines', 'history', 'settings']],
] as const;

/**
 * The pages for orchestrating several agents (tasks, review, team, knowledge, messages, machines, observed sources,
 * workspaces). Out of the navigation until "Advanced" is turned on in Settings; their addresses always work.
 */
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

/** The page list a person sees: everything with Advanced on, otherwise the CLI-first set. */
export const visibleNav = (advanced: boolean) =>
  nav.filter(([key]) => advanced || !ADVANCED_PAGES.has(key));

/** The navigation groups without the hidden pages; a group left empty is dropped. */
export const visibleGroups = (advanced: boolean) =>
  navGroups
    .map(
      ([group, pages]) => [group, pages.filter((p) => advanced || !ADVANCED_PAGES.has(p))] as const,
    )
    .filter(([, pages]) => pages.length > 0);

/** The pages on the phone's tab bar; "More" opens the drawer with the rest. */
export const tabPages = (advanced: boolean) =>
  advanced
    ? (['office', 'sessions', 'tasks', 'messages'] as const)
    : (['office', 'sessions', 'approvals', 'terminals'] as const);

/** The address of a page, keeping the project that is open. */
export const pageLink = (page: string, projectId: string | undefined) =>
  `/${page}${projectId ? `?project=${projectId}` : ''}`;

/** Whether an address names a page of the app (the first segment of its path). */
export const isPage = (page: string) => nav.some(([key]) => key === page);
