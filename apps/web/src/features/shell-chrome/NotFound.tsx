import { NavLink } from 'react-router-dom';
import { Empty } from '../../ui/Empty.js';
import { useT } from '../../ui/useT.js';

export function NotFound({ home }: { home: string }) {
  const t = useT();
  return (
    <Empty
      title={t('notFoundTitle')}
      hint={t('notFoundHint')}
      action={
        <NavLink className="primary" to={home}>
          {t('goHome')}
        </NavLink>
      }
    />
  );
}
