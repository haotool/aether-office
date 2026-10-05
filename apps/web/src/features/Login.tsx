import { useEffect, useState } from 'react';
import { ArrowUpRight, Globe2 } from 'lucide-react';
import { login, pair, type Session } from '../api.js';
import { usePreferences } from '../state.js';
import { useT, Field } from '../ui.js';

export function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const t = useT();
  const prefs = usePreferences();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Opened from a pairing QR code: the code is in the address's fragment. It is taken out of the address bar before
  // anything else (so it is in no history, bookmark or screenshot), then swapped for a session.
  const [pairing, setPairing] = useState(() => /^#pair=/.test(window.location.hash));
  useEffect(() => {
    const code = new URLSearchParams(window.location.hash.slice(1)).get('pair');
    if (!code) return;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    pair(code)
      .then(onLogin)
      .catch(() => {
        setError(t('pairFailed'));
        setPairing(false);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, on arrival
  if (pairing)
    return (
      <main className="login-page">
        <section className="login-panel" role="status">
          <img src="/favicon.svg" width="44" height="44" alt="" />
          <h1>{t('pairing')}</h1>
        </section>
      </main>
    );
  return (
    <main className="login-page">
      <div className="login-art" aria-hidden="true">
        <div className="orbital-ring r1" />
        <div className="orbital-ring r2" />
        <div className="orbital-ring r3" />
        <div className="login-wordmark">
          AETHER<span>OFFICE / ORBITAL CAMPUS</span>
        </div>
      </div>
      <section className="login-panel">
        <img src="/favicon.svg" width="44" height="44" alt="" />
        <span className="eyebrow">YOUR WORK, IN ORBIT</span>
        <h1>{t('loginTitle')}</h1>
        <p>{t('loginHint')}</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              const form = new FormData(e.currentTarget);
              onLogin(await login(String(form.get('token')), form.get('remember') === 'on'));
            } catch (e) {
              setError(e instanceof Error ? e.message : 'LOGIN_FAILED');
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label={t('token')}>
            <input
              autoFocus
              name="token"
              type="password"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              minLength={32}
            />
          </Field>
          <label className="toggle-label remember">
            <input type="checkbox" name="remember" />
            <span>{t('rememberDevice')}</span>
          </label>
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
          <button className="primary full-width" disabled={busy}>
            {busy ? t('loading') : t('login')}
            <ArrowUpRight size={17} />
          </button>
        </form>
        <small>{t('tokenHelp')}</small>
        <button
          className="text-button"
          onClick={() => prefs.set({ locale: prefs.locale === 'zh-TW' ? 'en' : 'zh-TW' })}
        >
          <Globe2 size={15} />
          {prefs.locale === 'zh-TW' ? 'English' : '繁體中文'}
        </button>
      </section>
    </main>
  );
}
