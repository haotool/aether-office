import { useState } from 'react';
import { execute } from '../../lib/api/api-commands.js';
import { Field } from '../../ui/Field.js';
import { useT } from '../../ui/useT.js';

type Invitation = { token: string; expiresAt: number };

function InviteFields() {
  const t = useT();
  return (
    <>
      <Field label={t('machineName')}>
        <input name="name" required maxLength={160} />
      </Field>
      <Field label={t('machineRoot')}>
        <input name="root" required placeholder="/srv/aether" />
      </Field>
      <Field label={t('machineConcurrency')}>
        <input name="concurrency" type="number" min={1} max={4} defaultValue={1} />
      </Field>
      <fieldset>
        <legend>{t('machineProviders')}</legend>
        {['demo', 'claude', 'codex'].map((p) => (
          <label key={p}>
            <input type="checkbox" name="provider" value={p} defaultChecked={p === 'demo'} /> {p}
          </label>
        ))}
      </fieldset>
    </>
  );
}

function InvitationReceipt({ invitation }: { invitation: Invitation }) {
  const t = useT();
  return (
    <div role="status" className="panel">
      <p>{t('machineInviteShown')}</p>
      <code>
        AETHER_INVITATION={invitation.token} pnpm runner:enroll --url {window.location.origin}
      </code>
      <p>
        <small>{new Date(invitation.expiresAt).toLocaleTimeString()}</small>
      </p>
    </div>
  );
}

/** The invitation token is shown once, held only in component state, and never persisted. */
export function MachineInvite({ projectId, canInvite }: { projectId: string; canInvite: boolean }) {
  const t = useT();
  const [error, setError] = useState('');
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  if (!canInvite) return null;
  return (
    <section aria-labelledby="invite-title">
      <h2 id="invite-title">{t('machineInvite')}</h2>
      <p className="muted">{t('machineInviteNote')}</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          setError('');
          setInvitation(null);
          try {
            const providers = form.getAll('provider').map(String);
            const receipt = await execute(
              'machine.invite',
              {
                name: form.get('name'),
                providers,
                roots: [form.get('root')],
                ttlSec: 600,
                concurrency: Number(form.get('concurrency')),
              },
              projectId,
            );
            setInvitation(receipt.result as Invitation);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'REQUEST_FAILED');
          }
        }}
      >
        <InviteFields />
        {error && <p role="alert">{error}</p>}
        <button type="submit">{t('machineInviteCreate')}</button>
      </form>
      {invitation && <InvitationReceipt invitation={invitation} />}
    </section>
  );
}
