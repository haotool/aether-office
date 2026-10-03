import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import { useT } from '../ui.js';

type Matrix = Record<string, Record<string, boolean | string>>;

export function useCapabilities() {
  return useQuery({
    queryKey: ['capabilities'],
    queryFn: () => api<{ providers: Matrix }>('/api/capabilities'),
    staleTime: Infinity,
  });
}

export function CapabilityMatrix() {
  const t = useT();
  const { data } = useCapabilities();
  if (!data) return null;
  const providers = Object.keys(data.providers);
  const flags = Object.keys(data.providers[providers[0]!]!);
  return (
    <section aria-labelledby="capabilities-title">
      <h2 id="capabilities-title">{t('capabilities')}</h2>
      <p className="muted">{t('capabilitiesNote')}</p>
      <div className="table-scroll" tabIndex={0} role="region" aria-label={t('capabilities')}>
        <table>
          <thead>
            <tr>
              <th scope="col">{t('capability')}</th>
              {providers.map((p) => (
                <th scope="col" key={p}>
                  {p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {flags.map((flag) => (
              <tr key={flag}>
                <th scope="row">{flag}</th>
                {providers.map((p) => {
                  const value = data.providers[p]![flag]!;
                  return (
                    <td key={p}>
                      {typeof value === 'boolean'
                        ? value
                          ? t('supported')
                          : t('unsupported')
                        : value}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
