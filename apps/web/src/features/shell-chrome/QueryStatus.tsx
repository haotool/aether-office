import { useT } from '../../ui/useT.js';

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
