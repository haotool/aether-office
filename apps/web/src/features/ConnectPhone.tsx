import { useEffect, useState } from 'react';
import { Smartphone } from 'lucide-react';
import { api } from '../api.js';
import { copyText } from '../browser-compat.js';
import { Field, Modal, useT } from '../ui.js';

type Pairing = {
  id: string;
  expiresAt: number;
  lan: boolean;
  links: { origin: string; url: string; svg: string }[];
};

/** An SVG as an image source: shown as a picture, so nothing in it can run. */
const asImage = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/**
 * Signs a phone in without typing the token: a QR code that works once and expires in five minutes (the server enforces
 * both). The person sees when the phone has used it.
 */
export function ConnectPhone() {
  const t = useT();
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [status, setStatus] = useState<'pending' | 'paired' | 'expired'>('pending');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [address, setAddress] = useState(0);

  async function generate() {
    setError('');
    setStatus('pending');
    setAddress(0);
    try {
      const made = await api<Pairing>('/api/pairings', { method: 'POST', body: '{}' });
      setPairing(made);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
    }
  }
  useEffect(() => {
    void generate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- asked for once, when the panel opens
  useEffect(() => {
    if (!pairing || !pairing.lan) return;
    const tick = () => setSeconds(Math.max(0, Math.round((pairing.expiresAt - Date.now()) / 1000)));
    tick();
    const clock = setInterval(tick, 1000);
    const poll = setInterval(async () => {
      try {
        const { status: next } = await api<{ status: typeof status }>(
          `/api/pairings/${pairing.id}`,
        );
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
          {live && pairing.links[address] && (
            <div className="pair-codes">
              <figure>
                <img
                  src={asImage(pairing.links[address].svg)}
                  alt={pairing.links[address].origin}
                  width="168"
                  height="168"
                />
                <figcaption>
                  <button
                    className="text-button"
                    onClick={async () => setCopied(await copyText(pairing.links[address]!.url))}
                  >
                    {pairing.links[address].origin}
                    {copied ? ' ✓' : ''}
                  </button>
                </figcaption>
              </figure>
              {pairing.links.length > 1 && (
                <Field label={t('pairAddress')}>
                  <select
                    value={address}
                    onChange={(e) => {
                      setAddress(Number(e.target.value));
                      setCopied(false);
                    }}
                  >
                    {pairing.links.map((link, index) => (
                      <option key={link.origin} value={index}>
                        {link.origin}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <p className="muted" role="timer">
                {t('pairExpiresIn')} {Math.floor(seconds / 60)}:
                {String(seconds % 60).padStart(2, '0')}
              </p>
            </div>
          )}
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
