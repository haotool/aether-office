import { errorText, savedLocale } from './error-text.js';
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(errorText(code, savedLocale())); // the message is for a person; `code` is for the code
  }
}
