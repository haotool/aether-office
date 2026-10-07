import { useQuery } from '@tanstack/react-query';
import type { Room } from '@aether/contracts';
import { api, execute } from '../api.js';
import { Field, useT } from '../ui.js';
import { AgentPicker, useCommandRunner, type AgentPanelProps } from './panel-kit.js';

export function useRooms(projectId: string) {
  return useQuery({
    queryKey: ['rooms', projectId],
    queryFn: () => api<{ rooms: Room[] }>(`/api/projects/${projectId}/rooms`),
    refetchInterval: 5000,
  });
}

export function Rooms({ projectId, agents, canManage }: AgentPanelProps) {
  const t = useT();
  const { error, run } = useCommandRunner([['rooms', projectId]], false);
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
          onSubmit={(e) => {
            e.preventDefault();
            const element = e.currentTarget; // React clears currentTarget after the first await
            const form = new FormData(element);
            void run(async () => {
              await execute(
                'room.create',
                { name: form.get('name'), members: form.getAll('members') },
                projectId,
              );
              element.reset();
            });
          }}
        >
          <Field label={t('roomName')}>
            <input name="name" required maxLength={160} />
          </Field>
          <AgentPicker name="members" label={t('roomMembers')} agents={agents} />
          {error && <p role="alert">{error}</p>}
          <button type="submit">{t('roomCreate')}</button>
        </form>
      )}
    </section>
  );
}
