import type { GitGraphCommit } from '@aether/contracts';
import { useT } from '../../ui/useT.js';
import { useGitGraph } from './use-git-graph.js';

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

type Commits = GitGraphCommit[];

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
