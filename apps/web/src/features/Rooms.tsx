import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Agent, Room } from '@aether/contracts';
import { api, execute } from '../api.js';
import { Field, useT } from '../ui.js';

export function useRooms(projectId: string) {
  return useQuery({
    queryKey: ['rooms', projectId],
    queryFn: () => api<{ rooms: Room[] }>(`/api/projects/${projectId}/rooms`),
    refetchInterval: 5000,
  });
}

export function Rooms({
  projectId,
  agents,
  canManage,
}: {
  projectId: string;
  agents: readonly Agent[];
  canManage: boolean;
}) {
  const t = useT();
  const client = useQueryClient();
  const [error, setError] = useState('');
  const rooms = useRooms(projectId);
  const name = (id: string) => agents.find((a) => a.id === id)?.name ?? t('humanRecipient');
  return (
    <section aria-labelledby="rooms-title">
      <h2 id="rooms-title">{t('rooms')}</h2>
      {rooms.data?.rooms.length === 0 && <p className="muted">{t('roomsEmpty')}</p>}
      <ul className="plain-list">
        {rooms.data?.rooms.map((r) => (
          <li key={r.id} className="panel">
            <strong>{r.name}</strong> · {r.members.map(name).join('、')}
          </li>
        ))}
      </ul>
      {canManage && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const element = e.currentTarget; // React clears currentTarget after the first await
            const form = new FormData(element);
            setError('');
            try {
              await execute(
                'room.create',
                { name: form.get('name'), members: form.getAll('members') },
                projectId,
              );
              element.reset();
              await client.invalidateQueries({ queryKey: ['rooms', projectId] });
            } catch (err) {
              setError(err instanceof Error ? err.message : 'REQUEST_FAILED');
            }
          }}
        >
          <Field label={t('roomName')}>
            <input name="name" required maxLength={160} />
          </Field>
          <Field label={t('roomMembers')}>
            <select name="members" multiple required size={Math.min(6, Math.max(2, agents.length))}>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          {error && <p role="alert">{error}</p>}
          <button type="submit">{t('roomCreate')}</button>
        </form>
      )}
    </section>
  );
}
