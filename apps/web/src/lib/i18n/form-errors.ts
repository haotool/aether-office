import type { Key } from './i18n.js';

export type FieldErrors = Record<string, Key>;

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const isControl = (el: Element): el is Control =>
  el instanceof HTMLInputElement ||
  el instanceof HTMLTextAreaElement ||
  el instanceof HTMLSelectElement;

export function checkForm(form: HTMLFormElement): FieldErrors {
  const errors: FieldErrors = {};
  let first: Control | null = null;
  for (const el of Array.from(form.elements)) {
    if (!isControl(el) || !el.name || errors[el.name]) continue;
    const blank = el.required && !el.value.trim();
    if (blank || !el.validity.valid) {
      errors[el.name] = blank || el.validity.valueMissing ? 'fieldRequired' : 'fieldInvalid';
      first ??= el;
    }
  }
  first?.focus();
  return errors;
}
