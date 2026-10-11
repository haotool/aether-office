import { useState } from 'react';
import { checkForm, type FieldErrors } from '../../lib/i18n/form-errors.js';
import { useT } from '../../ui/useT.js';

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
