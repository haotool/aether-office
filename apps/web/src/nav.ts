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

/** The address of a page, keeping the project that is open. */
export const pageLink = (page: string, projectId: string | undefined) =>
  `/${page}${projectId ? `?project=${projectId}` : ''}`;
