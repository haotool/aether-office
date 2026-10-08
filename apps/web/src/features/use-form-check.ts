import { useState } from 'react';
import { checkForm, type FieldErrors } from '../form-errors.js';
import { useT } from '../ui/useT.js';

/** Checking a form on submit: `check` shows the problems and says whether it passes, `problem` is a field's message. */
export function useFormCheck() {
  const t = useT();
  const [invalid, setInvalid] = useState<FieldErrors>({});
  const problem = (name: string) => (invalid[name] ? t(invalid[name]) : undefined);
  const check = (form: HTMLFormElement) => {
    const problems = checkForm(form);
    setInvalid(problems);
    return Object.keys(problems).length === 0;
  };
  return { problem, check };
}
