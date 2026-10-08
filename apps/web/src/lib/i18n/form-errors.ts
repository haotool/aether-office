import type { Key } from './i18n.js';

/** The fields of a form that cannot be submitted, by field name, as the words to show under each. */
export type FieldErrors = Record<string, Key>;

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const isControl = (el: Element): el is Control =>
  el instanceof HTMLInputElement ||
  el instanceof HTMLTextAreaElement ||
  el instanceof HTMLSelectElement;

/**
 * Checks a `noValidate` form with the browser's own rules (required, pattern, length) but our own words, in the page's
 * language instead of the operating system's. Focuses the first field that fails; an empty result means submit.
 */
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
