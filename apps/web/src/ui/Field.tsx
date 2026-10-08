import { useId, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  /** Why the field cannot be submitted, shown under it (the form's own check, see form-errors.ts). */
  error?: string | undefined;
  hint?: string;
  children: ReactNode;
}) {
  const id = useId();
  const child = isValidElement(children)
    ? (children as ReactElement<{ id?: string; required?: boolean }>)
    : null;
  const described = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ');
  return (
    <div className={child?.props.required ? 'field field-required' : 'field'}>
      <label htmlFor={id}>{label}</label>
      {child
        ? cloneElement(child as ReactElement<Record<string, unknown>>, {
            id,
            ...(error ? { 'aria-invalid': true } : {}),
            ...(described ? { 'aria-describedby': described } : {}),
          })
        : children}
      {hint && (
        <small id={`${id}-hint`} className="field-hint">
          {hint}
        </small>
      )}
      {error && (
        <p id={`${id}-error`} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
