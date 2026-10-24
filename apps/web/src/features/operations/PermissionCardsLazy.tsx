import { lazy, Suspense, type ComponentProps } from 'react';

const Cards = lazy(() =>
  import('./PermissionCard.js').then((m) => ({ default: m.PermissionCards })),
);
const Peek = lazy(() => import('./PermissionCard.js').then((m) => ({ default: m.PermissionPeek })));

export function PermissionCardsLazy(props: ComponentProps<typeof Cards>) {
  return (
    <Suspense fallback={null}>
      <Cards {...props} />
    </Suspense>
  );
}

export function PermissionPeekLazy(props: ComponentProps<typeof Peek>) {
  return (
    <Suspense fallback={null}>
      <Peek {...props} />
    </Suspense>
  );
}
