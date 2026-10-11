import { errorText, savedLocale } from '../i18n/error-text.js';
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(errorText(code, savedLocale()));
  }
}
