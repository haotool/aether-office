import { useEffect, useState } from 'react';
import { Smartphone } from 'lucide-react';
import { api } from '../api.js';
import { copyText } from '../browser-compat.js';
import { useLatest } from '../use-latest.js';
import { Field } from '../ui/Field.js';
import { Modal } from '../ui/Modal.js';
import { useT } from '../ui/useT.js';

type Pairing = {
  id: string;
  expiresAt: number;
  lan: boolean;
  links: { origin: string; url: string; svg: string }[];
};
type PairStatus = 'pending' | 'paired' | 'expired';

/** An SVG as an image source: shown as a picture, so nothing in it can run. */
const asImage = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Asks the server for a pairing (once, when the panel opens), counts down its expiry and watches for the phone using it. */
function usePairing() {
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [status, setStatus] = useState<PairStatus>('pending');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  async function generate() {
    setError('');
    setStatus('pending');
    try {
      const made = await api<Pairing>('/api/pairings', { method: 'POST', body: '{}' });
      setPairing(made);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
    }
  }
  const start = useLatest(generate);
  useEffect(() => {
    void start.current(); // asked for once, when the panel opens
  }, [start]);
  useEffect(() => {
    if (!pairing || !pairing.lan) return;
    const tick = () => setSeconds(Math.max(0, Math.round((pairing.expiresAt - Date.now()) / 1000)));
    tick();
    const clock = setInterval(tick, 1000);
    const poll = setInterval(async () => {
      try {
        const { status: next } = await api<{ status: PairStatus }>(`/api/pairings/${pairing.id}`);
        setStatus(next);
      } catch {
        /* the next look will do */
      }
    }, 2000);
    return () => {
      clearInterval(clock);
      clearInterval(poll);
    };
  }, [pairing]);
  return { pairing, status, seconds, error, generate };
}

/** The QR code of the chosen address, a way to copy its link, a picker when there are several, and the time left. */
function PairCodes({ links, seconds }: { links: Pairing['links']; seconds: number }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const [address, setAddress] = useState(0);
  const link = links[address];
  if (!link) return null;
  return (
    <div className="pair-codes">
      <figure>
        <img src={asImage(link.svg)} alt={link.origin} width="168" height="168" />
        <figcaption>
          <button className="text-button" onClick={async () => setCopied(await copyText(link.url))}>
            {link.origin}
            {copied ? ' ✓' : ''}
          </button>
        </figcaption>
      </figure>
      {links.length > 1 && (
        <Field label={t('pairAddress')}>
          <select
            value={address}
            onChange={(e) => {
              setAddress(Number(e.target.value));
              setCopied(false);
            }}
          >
            {links.map((l, index) => (
              <option key={l.origin} value={index}>
                {l.origin}
              </option>
            ))}
          </select>
        </Field>
      )}
      <p className="muted" role="timer">
        {t('pairExpiresIn')} {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
      </p>
    </div>
  );
}

/**
 * Signs a phone in without typing the token: a QR code that works once and expires in five minutes (the server enforces
 * both). The person sees when the phone has used it.
 */
function ConnectPhone() {
  const t = useT();
  const { pairing, status, seconds, error, generate } = usePairing();
  const live = pairing && status === 'pending' && seconds > 0;
  return (
    <div className="connect-phone">
      <p className="muted">{t('pairHint')}</p>
      {pairing && !pairing.lan && <p role="status">{t('pairNoLan')}</p>}
      {pairing?.lan && (
        <>
          <p className="muted">{t('pairHttp')}</p>
          {status === 'paired' && (
            <p role="status" className="paired">
              ✓ {t('pairPaired')}
            </p>
          )}
          {status !== 'paired' && !live && <p role="status">{t('pairExpired')}</p>}
          {live && <PairCodes key={pairing.id} links={pairing.links} seconds={seconds} />}
        </>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <button className="secondary" onClick={() => void generate()}>
        {pairing ? t('pairAgain') : t('pairGenerate')}
      </button>
    </div>
  );
}

/** "Open on your phone": a button that opens the pairing panel from anywhere in the app, not only from Settings. */
export function PairPhoneButton({ variant }: { variant: 'icon' | 'text' }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      {variant === 'icon' ? (
        <button
          className="icon-button"
          aria-label={t('pairOpen')}
          title={t('pairOpen')}
          onClick={() => setOpen(true)}
        >
          <Smartphone size={18} />
        </button>
      ) : (
        <button className="secondary" onClick={() => setOpen(true)}>
          <Smartphone size={18} aria-hidden="true" />
          {t('pairOpen')}
        </button>
      )}
      {open && (
        <Modal title={t('pairTitle')} onClose={() => setOpen(false)}>
          <ConnectPhone />
        </Modal>
      )}
    </>
  );
}
