import { useEffect, useState } from 'react';
import { ArrowUpRight, Globe2 } from 'lucide-react';
import { login, pair, type Session } from '../../lib/api/api-session.js';
import { checkForm, type FieldErrors } from '../../lib/i18n/form-errors.js';
import { useLocaleToggle } from '../shell-chrome/PreferenceControls.js';
import { useLatest } from '../../hooks/use-latest.js';
import { ReasonDefs } from '../../ui/ReasonDefs.js';
import { useT, useWhy } from '../../ui/useT.js';
import { Field } from '../../ui/Field.js';

type LoginFormProps = {
  error: string;
  setError: (message: string) => void;
  onLogin: (session: Session) => void;
};

function usePairingArrival(
  onLogin: (session: Session) => void,
  onFailed: (message: string) => void,
) {
  const t = useT();
  const [pairing, setPairing] = useState(() => /^#pair=/.test(window.location.hash));
  const latest = useLatest({ onLogin, onFailed, message: t('pairFailed') });
  useEffect(() => {
    const code = new URLSearchParams(window.location.hash.slice(1)).get('pair');
    if (!code) return;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    pair(code)
      .then((session) => latest.current.onLogin(session))
      .catch(() => {
        latest.current.onFailed(latest.current.message);
        setPairing(false);
      });
  }, [latest]);
  return pairing;
}

function TokenFields({ invalid }: { invalid: FieldErrors }) {
  const t = useT();
  return (
    <>
      <Field label={t('token')} error={invalid['token'] && t(invalid['token'])}>
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
    </>
  );
}

function LoginForm({ error, setError, onLogin }: LoginFormProps) {
  const t = useT();
  const whyNot = useWhy();
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState<FieldErrors>({});
  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const problems = checkForm(e.currentTarget);
        setInvalid(problems);
        if (Object.keys(problems).length) return;
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
      <TokenFields invalid={invalid} />
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <button className="primary full-width" disabled={busy} {...whyNot([!busy, 'whyBusy'])}>
        {busy ? t('loading') : t('login')}
        <ArrowUpRight size={17} />
      </button>
    </form>
  );
}

export function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const t = useT();
  const locale = useLocaleToggle();
  const [error, setError] = useState('');
  const pairing = usePairingArrival(onLogin, setError);
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
      <ReasonDefs />
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
        <h1>{t('loginTitle')}</h1>
        <p>{t('loginHint')}</p>
        <LoginForm error={error} setError={setError} onLogin={onLogin} />
        <small>{t('tokenHelp')}</small>
        <button className="text-button" onClick={locale.toggle}>
          <Globe2 size={15} />
          {locale.nextName}
        </button>
      </section>
    </main>
  );
}
