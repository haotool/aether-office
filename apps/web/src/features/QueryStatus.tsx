import { useT } from '../ui.js';

/** The loading line, or the error, of a page's query; nothing once the data is there. */
export function QueryStatus({ query }: { query: { isPending: boolean; error: Error | null } }) {
  const t = useT();
  if (query.isPending) return <p>{t('loading')}</p>;
  if (query.error)
    return (
      <p role="alert" className="error-text">
        {query.error.message}
      </p>
    );
  return null;
}
