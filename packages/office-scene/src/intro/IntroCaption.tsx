import { introCaption, introWords, type IntroCaptionKey } from './intro-text.js';

export function IntroCaption({
  caption,
  facts,
  zh,
  onSkip,
  onNever,
}: {
  caption: IntroCaptionKey;
  facts: { commits: number; tiers: number };
  zh: boolean;
  onSkip: () => void;
  onNever: () => void;
}) {
  const words = introWords(zh);
  return (
    <section className="intro-caption" data-intro-ui="" aria-label={words.label}>
      <p role="status">{introCaption(caption, facts, zh)}</p>
      <small className="intro-hint">{words.hint}</small>
      <div className="intro-actions">
        <button type="button" className="intro-action" onClick={onSkip}>
          {words.skip}
        </button>
        <button type="button" className="intro-action" onClick={onNever}>
          {words.never}
        </button>
      </div>
    </section>
  );
}

export function IntroDip({ id }: { id: string }) {
  return <div className="cut-dip" data-intro="" key={id} aria-hidden="true" />;
}
