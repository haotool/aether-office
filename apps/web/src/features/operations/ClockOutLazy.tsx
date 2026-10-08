import { lazy, Suspense, type ComponentProps } from 'react';

// The clock-out dialog loads when it is first opened, not with the office.
const Dialog = lazy(() => import('./ClockOut.js').then((m) => ({ default: m.ClockOut })));

export function ClockOutLazy(props: ComponentProps<typeof Dialog>) {
  return (
    <Suspense fallback={null}>
      <Dialog {...props} />
    </Suspense>
  );
}
