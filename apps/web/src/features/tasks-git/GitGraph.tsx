import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api/api.js';
import { useT } from '../../ui/useT.js';
import { POLL, poll } from '../../lib/app/polling.js';

type Commit = {
  sha: string;
  parents: string[];
  refs: string[];
  subject: string;
  author: string;
  at: number;
  lane: number;
  edges: { to: number; parent: string }[];
};

/** The recent commit graph of a project's repository, shared by the graph page and the 3D beanstalk. */
export function useGitGraph(projectId: string, enabled = true) {
  return useQuery({
    queryKey: ['git-graph', projectId],
    queryFn: () =>
      api<{ commits: Commit[]; lanes: number }>(`/api/projects/${projectId}/git-graph`),
    ...poll(POLL.slow),
    retry: false,
    enabled,
  });
}

const ROW = 24;
const LANE = 14;
const COLORS = [
  '#43e6df',
  '#a592ff',
  '#ffc65c',
  '#6aa8ff',
  '#ff7a85',
  '#3ee8a4',
  '#f6ad55',
  '#63b3ed',
];
const x = (lane: number) => 12 + lane * LANE;
const y = (row: number) => ROW / 2 + row * ROW;

type Commits = Commit[];

/** The lanes and the dots on them: one curve from each commit to its parent. */
function LaneGraph({ commits, lanes }: { commits: Commits; lanes: number }) {
  const rowOf = new Map(commits.map((c, i) => [c.sha, i]));
  const width = x(Math.min(lanes, 24)) + 8;
  return (
    <svg width={width} height={commits.length * ROW} aria-hidden="true">
      {commits.map((c, i) =>
        c.edges.map((edge) => {
          const j = rowOf.get(edge.parent) ?? commits.length;
          const color = COLORS[edge.to % COLORS.length];
          return (
            <path
              key={`${c.sha}:${edge.parent}`}
              d={`M ${x(c.lane)} ${y(i)} C ${x(c.lane)} ${y(i) + ROW * 0.6}, ${x(edge.to)} ${y(i) + ROW * 0.4}, ${x(edge.to)} ${y(i + 1)} L ${x(edge.to)} ${y(j)}`}
              stroke={color}
              strokeWidth={1.6}
              fill="none"
              opacity={0.85}
            />
          );
        }),
      )}
      {commits.map((c, i) => (
        <circle
          key={c.sha}
          cx={x(c.lane)}
          cy={y(i)}
          r={c.parents.length > 1 ? 5 : 4}
          fill={COLORS[c.lane % COLORS.length]}
          stroke="#050a12"
          strokeWidth={1.5}
        />
      ))}
    </svg>
  );
}

function CommitList({ commits }: { commits: Commits }) {
  return (
    <ol>
      {commits.map((c) => (
        <li key={c.sha} style={{ height: ROW }}>
          {c.refs.map((ref) => (
            <span key={ref} className="ref">
              {ref}
            </span>
          ))}
          <span className="subject">{c.subject}</span>
          <span className="sha">{c.sha.slice(0, 7)}</span>
        </li>
      ))}
    </ol>
  );
}

/** The repository's recent history as a lane graph: who branched where, and where work came back together. */
export function GitGraph({ projectId }: { projectId: string }) {
  const t = useT();
  const query = useGitGraph(projectId);
  if (query.isPending) return <p className="panel">{t('loading')}</p>;
  if (query.error) return <p className="panel">{query.error.message}</p>;
  const { commits, lanes } = query.data;
  return (
    <section className="panel git-graph">
      <h2>{t('gitGraph')}</h2>
      <div className="graph-scroll" tabIndex={0} aria-label={t('gitGraph')}>
        <div className="graph" style={{ height: commits.length * ROW }}>
          <LaneGraph commits={commits} lanes={lanes} />
          <CommitList commits={commits} />
        </div>
      </div>
    </section>
  );
}
