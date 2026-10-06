import { introCaption, introWords, type IntroCaptionKey } from './intro-text.js';

/**
 * The first-visit tour's caption: a glass pill at the bottom with what the camera is showing, a Skip button and "Don't
 * show again". `role="status"` carries the words only (read out once per change); focus is never moved. Anything inside
 * `data-intro-ui` is the tour's own control, so pressing it does not count as an input that interrupts the tour.
 */
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

/** A dip to the night colour that hides a cut; the page's `.cut-dip` with the tour's longer duration. A new `id` replays it. */
export function IntroDip({ id }: { id: string }) {
  return <div className="cut-dip" data-intro="" key={id} aria-hidden="true" />;
}
