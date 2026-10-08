import { registerLocale } from '../../apps/web/src/lib/i18n/i18n.js';
import { en } from '../../apps/web/src/locales/en.js';
import { zh } from '../../apps/web/src/locales/zh.js';

// The app downloads one language table at a time; the tests that render text have both ready.
registerLocale('en', en);
registerLocale('zh-TW', zh);
