import type { ReactNode } from 'react';
import { Hint } from './Disclosure.js';

export function PageHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="u-head page-heading">
      <div>
        <h1>{title}</h1>
        {subtitle && <Hint>{subtitle}</Hint>}
      </div>
      {action && <div className="u-head__actions">{action}</div>}
    </div>
  );
}
