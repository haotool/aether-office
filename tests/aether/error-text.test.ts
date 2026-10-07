import { expect, it } from 'vitest';
import { errorText } from '../../apps/web/src/error-text.js';

const CJK = /[㐀-鿿]/;

it('says in words, in the chosen language, what a CLI user can run into', () => {
  for (const code of [
    'AUTH_REQUIRED',
    'LOGIN_RATE_LIMIT',
    'LIVE_EXECUTION_NOT_ENABLED',
    'TERMINAL_PROFILE_NOT_GRANTED',
    'SESSION_NOT_FOUND',
    'PROCESS_CHANGED',
    'VERSION_CONFLICT',
    'PROJECT_ROOT_NOT_FOUND',
    'PROJECT_ROOT_INVALID',
  ]) {
    expect(errorText(code, 'en'), code).not.toBe(code);
    expect(errorText(code, 'en'), code).not.toMatch(CJK);
    expect(errorText(code, 'zh-TW'), code).toMatch(CJK);
  }
});

it('keeps the code for anything it has no words for, so the cause is never hidden', () => {
  expect(errorText('DAG_CYCLE', 'zh-TW')).toBe('DAG_CYCLE');
  expect(errorText('SOMETHING_NEW', 'en')).toBe('SOMETHING_NEW');
});
