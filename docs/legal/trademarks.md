# Trademarks

[Documentation](../README.md) · [Project](../../README.md)

AETHER OFFICE works with tools and services made by other companies and has to name them. This page records how it does so and
which published guidelines were read. It is not legal advice; the open question at the end needs the maintainer's decision.

## Statement

AETHER OFFICE is an independent open-source project. It is not affiliated with, endorsed by or sponsored by Anthropic, OpenAI,
GitHub, Linear, Tailscale or any other company named in it. Claude and Claude Code are trademarks of Anthropic, PBC. OpenAI and
Codex are trademarks of OpenAI. GitHub, Linear and Tailscale are trademarks of their respective owners, as are all other names
and marks mentioned. (The README, `NOTICE`, the generated
`THIRD_PARTY_NOTICES.md` and Settings, About carry the short form of this statement.)

## How names are used

- **Plain text, to say what the project works with** ("see your Claude Code and Codex sessions", "GitHub owner", "Linear team
  key"). This is referential (nominative) use: the name is needed to identify the product, only as much of it is used as is
  needed, and nothing suggests sponsorship.
- **Not in the project's own branding.** The project name, logo (`favicon.svg`, the letter A with an orbit), repository name
  and release titles contain no third-party name or mark.
- **No third-party logo files** are in the repository: none was downloaded from a brand kit or press page.

## Guidelines read (2026-10-07)

| Owner     | Source                                                                                                                          | What it says, in short                                                                                                                                                                                                                                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anthropic | [Claude Code legal and compliance](https://code.claude.com/docs/en/legal-and-compliance), "Using the Claude Code name and logo" | You may accurately say in plain text that a product runs Claude Code; you may not use the Claude Code or Anthropic names or logos as part of your own product, feature or company name or logo, or in a way that suggests Anthropic built, endorses or partners with the product; any other use of names or logos needs written permission under the Trademark Guidelines. |
| Anthropic | [Trademark Guidelines](https://www.anthropic.com/legal/trademark-guidelines)                                                    | Marks only as permitted and in approved materials; logos are supplied by Anthropic and may not be altered (colour, font, proportion); no implied sponsorship or affiliation.                                                                                                                                                                                               |
| OpenAI    | [Brand guidelines](https://openai.com/brand/) (the page refused automated access; read through search-engine extracts)          | Name and marks are OpenAI's; do not use the logo more prominently than your own, modify it, design a similar logo or use it in your branding; "powered by" style references in text are the recommended form.                                                                                                                                                              |

The project follows these in its text. GitHub, Linear and Tailscale are named only in plain text labels and documentation.

## Provider marks

`packages/office-scene/src/core/provider-marks.tsx` draws a small mark next to each session as a **provider indicator**: for Claude
an eight-ray starburst in its own colour, for Codex a knot of three interlaced loops tinted to the interface's muted text
colour (not a brand colour). The marks are simplified, 14 px-ish and decorative (`aria-hidden`); the provider's name stays as
text (tooltip, visually hidden text, labels, filters), which carries the meaning. They belong to Anthropic and OpenAI, appear
only inside the user's own local application to say which provider a session runs on, imply no endorsement, and are **never
used as the project's own logo or branding** (the project logo is `favicon.svg`). This follows the practice of the Happy
project (slopus/happy, MIT), which shows a vendor mark only as a small provider indicator.

**Residual risk.** Both guidelines above restrict logo use to supplied, unaltered artwork and, for anything beyond plain text,
ask for permission, and a simplified look-alike is closer to an "altered mark" than to plain-text reference. The maintainer
accepts this for small indicators; the lower-risk options are to replace the marks with neutral glyphs (the change would touch
only `provider-marks.tsx` and its colours in `apps/web/src/styles/core/tokens.css` and `scene/scene-overlays.css`) or to request
permission from Anthropic (marketing@anthropic.com) and OpenAI (partnercomms@openai.com).
