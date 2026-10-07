import { useEffect, useState, type RefObject } from 'react';
import type { StalkHover } from './Beanstalk.js';
import { speciesName } from './flower-names.js';
import type { Tier } from './stalk-types.js';

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
function counts(tier: Tier, en: boolean): string {
  const unit = (n: number, one: string, many: string, zh: string) =>
    en ? `${n} ${n === 1 ? one : many}` : `${n} ${zh}`;
  return [
    unit(tier.commits, 'commit', 'commits', '個提交'),
    unit(tier.merges, 'merge', 'merges', '次合併'),
    unit(tier.authors, 'author', 'authors', '位作者'),
  ].join(' · ');
}

/**
 * What the spire says under the pointer. A commit: short hash, subject, author, age, and the branches it carries (or, for a
 * commit in the middle of a branch, the branch it belongs to). A flower of the crown (one for each tier of
 * history): its code name and tier, its species (named from its genome, in the person's language), the dates its commits span and
 * how many commits, merges and authors built it, and the commit that seeded it (a merge commit's flower says what the merge says). A plain overlay that never takes the pointer, so the camera keeps
 * orbiting under it. The scene feeds it through `show`, which this component fills in, so a moving pointer redraws
 * only the tooltip and not the whole scene.
 */
export function StalkTooltip({
  show,
  strands,
  locale,
}: {
  show: RefObject<((hover: StalkHover) => void) | null>;
  strands: readonly { name: string; color: string }[];
  locale: string;
}) {
  const [hover, setHover] = useState<StalkHover>(null);
  useEffect(() => {
    show.current = setHover;
    return () => {
      show.current = null;
    };
  }, [show]);
  if (!hover) return null;
  const { x, y, flip } = hover;
  if ('bloom' in hover) {
    const { bloom } = hover;
    const en = locale === 'en';
    const day = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' });
    const tier = bloom.tier;
    const label = bloom.merge
      ? en
        ? 'Merge flower'
        : '合併花'
      : tier
        ? en
          ? `Tier ${tier.index + 1}`
          : `第 ${tier.index + 1} 層`
        : en
          ? 'Crown bloom'
          : '頂端大花';
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
          <em>{label}</em>
        </span>
        <b>
          {bloom.merge
            ? bloom.merge.subject
            : speciesName(bloom.genome.archetype, bloom.genome.epithet, en)}
        </b>
        <small>
          {bloom.merge
            ? `${speciesName(bloom.genome.archetype, bloom.genome.epithet, en)} · ${ago(bloom.to, Date.now(), locale)}`
            : `${day.format(bloom.from)} – ${day.format(bloom.to)} · ${
                tier ? counts(tier, en) : `${bloom.commits} ${en ? 'commits' : '個提交'}`
              }`}
        </small>
        <span className="stalk-tip-chips">
          <i>{en ? `seeded by ${bloom.sha.slice(0, 7)}` : `種子 ${bloom.sha.slice(0, 7)}`}</i>
        </span>
      </div>
    );
  }
  const { node } = hover;
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
        {node.merge && <em>{locale === 'en' ? 'merge' : '合併'}</em>}
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
