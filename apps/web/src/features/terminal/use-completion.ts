import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AttributedSession, CustomCommand } from '@aether/contracts';
import { api } from '../../lib/api/api.js';
import { useLocale, useT } from '../../ui/useT.js';
import {
  atToken,
  rankSlash,
  slashToken,
  type SlashItem,
  type Token,
} from '../conversation/composer-model.js';
import type { MenuRow } from '../terminal/ComposerMenu.js';
import { slashItems } from '../conversation/slash-commands.js';

const MENU_ROWS = 8;

type SlashRow = MenuRow & { item: SlashItem };

/** The rows of the slash menu: built-ins, skills and the project's own commands, ranked by what was typed. */
function useSlashRows(session: AttributedSession, slash: Token | null): SlashRow[] {
  const t = useT();
  const locale = useLocale();
  const commands = useQuery({
    queryKey: ['session-commands', session.key],
    queryFn: () =>
      api<{ commands: CustomCommand[] }>(
        `/api/local-sessions/${encodeURIComponent(session.key)}/commands`,
      ),
    enabled: !!slash,
    staleTime: 60_000,
    retry: false,
  });
  if (!slash) return [];
  return rankSlash(
    slashItems(session.provider, commands.data?.commands ?? []),
    slash.query,
    MENU_ROWS,
  ).map((item) => ({
    id: item.id,
    item,
    label: `/${item.name}`,
    badge:
      item.kind === 'skill'
        ? t('composerSkill')
        : item.source === 'builtin'
          ? undefined
          : t('composerCustom'),
    hint: [
      typeof item.description === 'string' ? item.description : item.description[locale],
      item.kind === 'picker' ? t('composerPicker') : '',
    ]
      .filter(Boolean)
      .join(' · '),
  }));
}

/** The rows of the `@` menu: the project's files that match what was typed. */
function useFileRows(session: AttributedSession, at: Token | null): MenuRow[] {
  const files = useQuery({
    queryKey: ['session-files', session.key, at?.query ?? ''],
    queryFn: () =>
      api<{ files: string[] }>(
        `/api/local-sessions/${encodeURIComponent(session.key)}/files?q=${encodeURIComponent(at?.query ?? '')}`,
      ),
    enabled: !!at,
    placeholderData: (previous) => previous,
    retry: false,
  });
  return at ? (files.data?.files ?? []).map((f) => ({ id: f, label: f })) : [];
}

/** The completion menu under the box: which token is being completed, its rows, and the highlighted one. */
export function useCompletion(session: AttributedSession, text: string, caret: number) {
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState('');
  const slash = slashToken(text, caret);
  const at = slash ? null : atToken(text, caret);
  const token: Token | null = slash ?? at;
  const slashRows = useSlashRows(session, slash);
  const fileRows = useFileRows(session, at);
  const rows: MenuRow[] = slash ? slashRows : fileRows;
  const here = token ? `${token.start}:${text.slice(0, caret)}` : '';
  return {
    token,
    isSlash: !!slash,
    rows,
    open: !!token && dismissed !== here,
    current: Math.min(active, Math.max(rows.length - 1, 0)),
    setActive,
    dismiss: () => setDismissed(here),
    /** The text a chosen row inserts: `/name ` for a command, `@path ` for a file. */
    insertion: (row: MenuRow) => (slash ? `/${(row as SlashRow).item.name} ` : `@${row.id} `),
  };
}

export type Completion = ReturnType<typeof useCompletion>;
