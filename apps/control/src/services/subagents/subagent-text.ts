import { neutralizeHtml, stripCliWrappers, toPlainPreview } from '@aether/kernel';
import { redactSecrets } from '../platform/redaction.js';

const SANITIZE_CHARS = 200_000;

/**
 * Secrets are redacted first, on the whole bounded input, so a cut can never leave half a token that no pattern
 * recognises.
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
