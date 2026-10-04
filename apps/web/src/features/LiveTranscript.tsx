import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import { useT } from '../ui.js';

type Entry = {
  at: number | null;
  role: 'user' | 'assistant' | 'tool' | 'result';
  name: string | null;
  text: string;
  error: boolean;
};
type Transcript = {
  entries: Entry[];
  analysis: {
    tools: { name: string; count: number }[];
    commands: string[];
    files: string[];
    messages: { user: number; assistant: number };
  };
  updatedAt: number;
  truncated: boolean;
};

/** What a local session is saying and doing right now: the latest turns, the tools it runs and the files it touches. */
export function LiveTranscript({ sessionKey }: { sessionKey: string }) {
  const t = useT();
  const query = useQuery({
    queryKey: ['transcript', sessionKey],
    queryFn: () =>
      api<Transcript>(`/api/local-sessions/${encodeURIComponent(sessionKey)}/transcript`),
    refetchInterval: 3000,
    retry: false,
  });
  if (query.error) return <p role="alert">{query.error.message}</p>;
  if (!query.data) return <p>{t('loading')}</p>;
  const { entries, analysis } = query.data;
  return (
    <div className="live-transcript">
      <div className="analysis">
        <div>
          <b>{t('toolsUsed')}</b>
          <ul className="chips">
            {analysis.tools.map((tool) => (
              <li key={tool.name}>
                {tool.name} <i>{tool.count}</i>
              </li>
            ))}
            {!analysis.tools.length && <li>—</li>}
          </ul>
        </div>
        {analysis.files.length > 0 && (
          <div>
            <b>{t('filesTouched')}</b>
            <ul className="mono-list">
              {analysis.files.slice(-6).map((file) => (
                <li key={file} title={file}>
                  {file}
                </li>
              ))}
            </ul>
          </div>
        )}
        {analysis.commands.length > 0 && (
          <div>
            <b>{t('commandsRun')}</b>
            <ul className="mono-list">
              {analysis.commands.slice(-4).map((command, i) => (
                <li key={i}>{command}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <ol className="transcript" tabIndex={0} aria-label={t('liveTranscript')}>
        {entries.map((entry, i) => (
          <li key={i} className={`entry ${entry.role} ${entry.error ? 'error' : ''}`}>
            <span className="who">
              {entry.role === 'tool' ? entry.name : t(`role_${entry.role}`)}
            </span>
            <span className="text">{entry.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
