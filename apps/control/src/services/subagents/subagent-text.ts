import { neutralizeHtml, stripCliWrappers, toPlainPreview } from '@aether/kernel';
import { redactSecrets } from '../platform/redaction.js';

/** Bounds the work the sanitizers do on one text (a transcript line is already capped at 200 KB; this is the same order). */
const SANITIZE_CHARS = 200_000;

/**
 * Pure. A subagent's words as the short plain text the panels show: secrets are redacted first (on the whole bounded input,
 * so a cut can never leave half a token that no pattern recognises, up to a bound that is a whole transcript line), then CLI wrappers are resolved and HTML neutralized
 * (`stripCliWrappers`, `neutralizeHtml`), Markdown becomes plain text on one line (`toPlainPreview`), and the result is cut to `max`
 * characters. Redaction runs again on the flattened text, before the cut, because removing markup can join pieces of a token.
 */
export function plainSummary(raw: string, max: number): string {
  const redacted = redactSecrets(raw.slice(0, SANITIZE_CHARS));
  const flat = redactSecrets(
    toPlainPreview(neutralizeHtml(stripCliWrappers(redacted)), { maxLines: 1 }),
  ).trim();
  // The cut comes last, after the whole text was flattened and redacted again (markup can split or join a token), so it
  // can only ever cut ordinary words, never leave a piece of a secret.
  const chars = Array.from(flat);
  return chars.length <= max
    ? flat
    : `${chars
        .slice(0, max - 1)
        .join('')
        .trimEnd()}…`;
}
