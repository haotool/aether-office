import { REASONS, reasonId } from './whyNot.js';
import { useT } from './useT.js';

/** The text behind every `aria-describedby` that `whyNot` sets: a disabled control cannot take focus to be read out. */
export function ReasonDefs() {
  const t = useT();
  return (
    <div hidden>
      {REASONS.map((reason) => (
        <span key={reason} id={reasonId(reason)}>
          {t(reason)}
        </span>
      ))}
    </div>
  );
}
