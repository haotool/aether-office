import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUpRight, Globe2 } from 'lucide-react';
import {
  isLocalHost,
  localSignIn,
  login,
  pair,
  signedOut,
  type Session,
} from '../../lib/api/api-session.js';
import { checkForm, type FieldErrors } from '../../lib/i18n/form-errors.js';
import { useLocaleToggle } from '../shell-chrome/PreferenceControls.js';
import { useLatest } from '../../hooks/use-latest.js';
import { ReasonDefs } from '../../ui/ReasonDefs.js';
import { useT, useWhy } from '../../ui/useT.js';
import { Field } from '../../ui/Field.js';

type LoginFormProps = {
  focus: boolean;
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

const onThisMachine = () => isLocalHost(window.location.hostname);

function useLocalArrival(onLogin: (session: Session) => void, skip: boolean) {
  const [trying, setTrying] = useState(() => !skip && !signedOut() && onThisMachine());
  const started = useRef(false);
  const latest = useLatest({ onLogin });
  useEffect(() => {
    if (!trying || started.current) return;
    started.current = true;
    localSignIn()
      .then((session) => (session ? latest.current.onLogin(session) : setTrying(false)))
      .catch(() => setTrying(false));
  }, [trying, latest]);
  return trying;
}

function TokenFields({ invalid, focus }: { invalid: FieldErrors; focus: boolean }) {
  const t = useT();
  return (
    <>
      <Field label={t('token')} error={invalid['token'] && t(invalid['token'])}>
        <input
          autoFocus={focus}
          name="token"
          type="password"
          autoComplete="current-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          minLength={32}
        />
      </Field>
      <label className="toggle-label remember">
        <input type="checkbox" name="remember" defaultChecked />
        <span>{t('rememberDevice')}</span>
      </label>
    </>
  );
}

function LocalButton({ setError, onLogin }: Pick<LoginFormProps, 'setError' | 'onLogin'>) {
  const t = useT();
  return (
    <button
      className="primary full-width"
      onClick={() =>
        localSignIn()
          .then((session) => (session ? onLogin(session) : setError(t('localSignInOff'))))
          .catch((e) => setError(e instanceof Error ? e.message : 'LOGIN_FAILED'))
      }
    >
      {t('localSignIn')}
    </button>
  );
}

function LoginForm({ focus, error, setError, onLogin }: LoginFormProps) {
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
      <TokenFields invalid={invalid} focus={focus} />
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

function TokenAccess({ here, children }: { here: boolean; children: ReactNode }) {
  const t = useT();
  return here ? (
    <>
      {children}
      <small>{t('tokenHelp')}</small>
    </>
  ) : (
    <details className="login-token">
      <summary>{t('loginHaveToken')}</summary>
      {children}
    </details>
  );
}

export function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const t = useT();
  const locale = useLocaleToggle();
  const [error, setError] = useState('');
  const pairing = usePairingArrival(onLogin, setError);
  const local = useLocalArrival(onLogin, pairing);
  const here = onThisMachine();
  const form = <LoginForm focus={here} error={error} setError={setError} onLogin={onLogin} />;
  if (pairing || local)
    return (
      <main className="login-page">
        <section className="login-panel" role="status">
          <img src="/favicon.svg" width="44" height="44" alt="" />
          <h1>{pairing ? t('pairing') : t('signingIn')}</h1>
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
        <p>{here ? t('loginHint') : t('loginPhoneHint')}</p>
        {here && signedOut() && <LocalButton setError={setError} onLogin={onLogin} />}
        <TokenAccess here={here}>{form}</TokenAccess>
        <button className="text-button" onClick={locale.toggle}>
          <Globe2 size={15} />
          {locale.nextName}
        </button>
      </section>
    </main>
  );
}
