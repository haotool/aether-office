import { useEffect, useState, type RefObject } from 'react';
import type { StalkHover } from './Beanstalk.js';
import { speciesName } from '../flowers/flower-names.js';
import type { Tier } from '../core/stalk-types.js';
import { sceneText, type SceneKey } from '../i18n/scene-text.js';

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

/** "3 days ago", "2 hours ago", "just now", in the person's language. */
function ago(at: number, now: number, locale: string): string {
  const age = now - at;
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const [unit, ms] = UNITS.find(([, size]) => age >= size) ?? ['minute', 60_000];
  return format.format(-Math.floor(age / ms), unit);
}

/** "12 commits · 2 merges · 3 authors" and the like, in the person's language. */
function counts(tier: Tier, zh: boolean): string {
  const unit = (n: number, one: SceneKey, many: SceneKey) =>
    sceneText(zh, n === 1 ? one : many, { n });
  return [
    unit(tier.commits, 'tip.commitOne', 'tip.commitMany'),
    unit(tier.merges, 'tip.mergeOne', 'tip.mergeMany'),
    unit(tier.authors, 'tip.authorOne', 'tip.authorMany'),
  ].join(' · ');
}

type Hover = NonNullable<StalkHover>;
type BloomHover = Extract<Hover, { bloom: unknown }>;
type CommitHover = Exclude<Hover, BloomHover>;
type Strands = readonly { name: string; color: string }[];

/** The label of a flower: a merge's, the tier's, or the crown's. */
function bloomLabel({ bloom }: BloomHover, zh: boolean): string {
  if (bloom.merge) return sceneText(zh, 'tip.mergeFlower');
  if (bloom.tier) return sceneText(zh, 'tip.tier', { n: bloom.tier.index + 1 });
  return sceneText(zh, 'tip.crownBloom');
}

/** A flower of the crown: its code name and tier, its species, the dates and counts of the history that built it, and its seed commit. */
function BloomTip({
  hover,
  strands,
  locale,
}: {
  hover: BloomHover;
  strands: Strands;
  locale: string;
}) {
  const { bloom, x, y, flip } = hover;
  const zh = locale !== 'en';
  const day = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' });
  const tier = bloom.tier;
  const species = speciesName(bloom.genome.archetype, bloom.genome.epithet, !zh);
  return (
    <div
      className={`stalk-tip ${flip ? 'flip' : ''}`}
      style={{
        left: x,
        top: y,
        ['--strand' as string]: strands[bloom.merge?.strand ?? tier?.strand ?? 0]?.color,
      }}
      role="status"
    >
      <span className="stalk-tip-head">
        <code>{bloom.genome.code}</code>
        <em>{bloomLabel(hover, zh)}</em>
      </span>
      <b>{bloom.merge ? bloom.merge.subject : species}</b>
      <small>
        {bloom.merge
          ? `${species} · ${ago(bloom.to, Date.now(), locale)}`
          : `${day.format(bloom.from)} – ${day.format(bloom.to)} · ${
              tier ? counts(tier, zh) : sceneText(zh, 'tip.commitMany', { n: bloom.commits })
            }`}
      </small>
      <span className="stalk-tip-chips">
        <i>{sceneText(zh, 'tip.seededBy', { sha: bloom.sha.slice(0, 7) })}</i>
      </span>
    </div>
  );
}

/** A commit: short hash, subject, author, age, and the branches it carries (or the branch it belongs to). */
function CommitTip({
  hover,
  strands,
  locale,
}: {
  hover: CommitHover;
  strands: Strands;
  locale: string;
}) {
  const { node, x, y, flip } = hover;
  const strand = strands[node.strand];
  const names = node.refs.length ? node.refs : strand?.name ? [strand.name] : [];
  return (
    <div
      className={`stalk-tip ${flip ? 'flip' : ''}`}
      style={{ left: x, top: y, ['--strand' as string]: strand?.color }}
      role="status"
    >
      <span className="stalk-tip-head">
        <code>{node.sha.slice(0, 7)}</code>
        {node.merge && <em>{sceneText(locale !== 'en', 'tip.merge')}</em>}
      </span>
      <b>{node.subject}</b>
      <small>
        {node.author} · {ago(node.at, Date.now(), locale)}
      </small>
      {names.length > 0 && (
        <span className="stalk-tip-chips">
          {names.map((name) => (
            <i key={name}>{name}</i>
          ))}
        </span>
      )}
    </div>
  );
}

type TooltipProps = {
  show: RefObject<((hover: StalkHover) => void) | null>;
  strands: Strands;
  locale: string;
};

/**
 * What the spire says under the pointer. A commit: short hash, subject, author, age, and the branches it carries (or, for a
 * commit in the middle of a branch, the branch it belongs to). A flower of the crown (one for each tier of
 * history): its code name and tier, its species (named from its genome, in the person's language), the dates its commits span and
 * how many commits, merges and authors built it, and the commit that seeded it (a merge commit's flower says what the merge says). A plain overlay that never takes the pointer, so the camera keeps
 * orbiting under it. The scene feeds it through `show`, which this component fills in, so a moving pointer redraws
 * only the tooltip and not the whole scene.
 */
export function StalkTooltip({ show, strands, locale }: TooltipProps) {
  const [hover, setHover] = useState<StalkHover>(null);
  useEffect(() => {
    show.current = setHover;
    return () => {
      show.current = null;
    };
  }, [show]);
  if (!hover) return null;
  return 'bloom' in hover ? (
    <BloomTip hover={hover} strands={strands} locale={locale} />
  ) : (
    <CommitTip hover={hover} strands={strands} locale={locale} />
  );
}
