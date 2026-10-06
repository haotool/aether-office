import type { Key } from '../../i18n.js';

/** The groups of Settings, in the order a person comes to them. */
export const SECTIONS = [
  { id: 'general', label: 'sectGeneral', hint: 'sectGeneralHint' },
  { id: 'notifications', label: 'sectNotify', hint: 'sectNotifyHint' },
  { id: 'connections', label: 'sectConnect', hint: 'sectConnectHint' },
  { id: 'models', label: 'sectModels', hint: 'sectModelsHint' },
  { id: 'office', label: 'sectOffice', hint: 'sectOfficeHint' },
  { id: 'advanced', label: 'sectAdvanced', hint: 'sectAdvancedHint' },
  { id: 'data', label: 'sectData', hint: 'sectDataHint' },
  { id: 'about', label: 'sectAbout', hint: 'sectAboutHint' },
] as const satisfies readonly { id: string; label: Key; hint: Key }[];

export type SectionId = (typeof SECTIONS)[number]['id'];

export const isSection = (value: string): value is SectionId =>
  SECTIONS.some((section) => section.id === value);

/**
 * The section an address names: `/settings/<section>` first, then `#section`. Null is the home (on a phone, the list;
 * on a larger screen, the top of the page). An unknown name is the home too.
 */
export function sectionFromLocation(pathname: string, hash: string): SectionId | null {
  const [, page, name] = pathname.split('/');
  const named = page === 'settings' ? (name ?? '') : '';
  if (isSection(named)) return named;
  const fragment = hash.replace(/^#/, '');
  return isSection(fragment) ? fragment : null;
}

/** The address of a section (or of the home), keeping the project that is open. */
export const settingsPath = (id: SectionId | null, projectId: string | undefined) =>
  `/settings${id ? `/${id}` : ''}${projectId ? `?project=${projectId}` : ''}`;
