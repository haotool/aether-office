# Screenshots

[Documentation](../README.md) · [Project](../../README.md)

The English and Traditional Chinese README heroes are 1920x1320 WebP compositions; their source record is below. Every screenshot here is a JPEG
of at most 250 KB, taken from a throwaway demo stack on **synthetic data**: invented repositories
(`harbor-web`, `ledger-api`, ...), authors, conversations and token counts, fake `claude` processes (`sleep`, named
`claude`) and hook records. Nothing is read from a real `~/.claude` or `~/.codex`, no model is called, and the stack and its
data directory are deleted afterwards. The LAN address in the pairing image is a stand-in (a private-range example); the QR code in
it belongs to the deleted stack and works nowhere. The interface is shown in English, dark theme unless the name says light or ends in `zh-TW`. Synthetic conversation content keeps its original language even when the application chrome is Traditional Chinese.

| File                                                        | Size              | Shows                                                                                                  |
| ----------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------ |
| `readme-hero.en.webp`                                       | 1920x1320         | English dark control-room cover: orbital A logo, office/conversation, Git flower and phone             |
| `readme-hero.zh-TW.webp`                                    | 1920x1320         | Traditional Chinese cover with localized application chrome and captions                               |
| `git-flower-desktop.en.jpg`, `git-flower-desktop.zh-TW.jpg` | 806x578 / 806x575 | Actual scene canvas during the flower-crown tour, in English and Traditional Chinese                   |
| `session-conversation-desktop.zh-TW.jpg`                    | 1440x900          | Traditional Chinese office and conversation interface                                                  |
| `sessions-phone.zh-TW.jpg`                                  | 390x844 @2x       | Traditional Chinese mobile session feed                                                                |
| `office-overview-desktop.jpg`                               | 1440x900          | The building, the Git beanstalk with its flower crown and the live session panel (README)              |
| `office-overview-desktop-light.jpg`                         | 1440x900          | The same in the light theme                                                                            |
| `office-crown-desktop.jpg`                                  | 1440x900          | The crown close up: one flower per twelve commits, a great bloom on top (exploded view)                |
| `session-conversation-desktop.jpg`                          | 1440x900          | A conversation with Markdown, a table, folded tool calls, a squad strip and subagent activity (README) |
| `approval-card-desktop.jpg`                                 | 1440x900          | A permission request as a card (Remote approvals on) (README)                                          |
| `kpi-dashboard-desktop.jpg`                                 | 1440x900          | The KPI dashboard for the building, 7 days (README)                                                    |
| `squad-strings-desktop.jpg`                                 | 1440x900          | A squad around its supervisor's desk with puppet strings; stand-in subagents (`?squad=4`) (README)     |
| `character-menu-desktop.jpg`                                | 1440x900          | A character's action menu, with the disabled items and why (README)                                    |
| `settings-office-desktop.jpg`                               | 1440x900          | Settings, Office group                                                                                 |
| `connect-phone-desktop.jpg`                                 | 1440x900          | The "Connect a phone" dialog with its QR code                                                          |
| `office-phone.jpg`                                          | 390x844 @2x       | The office on a phone with a pending approval (README)                                                 |
| `sessions-phone.jpg`                                        | 390x844 @2x       | The live sessions bottom sheet (README)                                                                |
| `conversation-phone.jpg`                                    | 390x844 @2x       | A conversation in the bottom sheet                                                                     |

## Hero provenance

- **Sources:** `session-conversation-desktop.jpg` and `sessions-phone.jpg` were refreshed from the current application. Their `zh-TW` counterparts were captured with the application locale set to Traditional Chinese. Both `git-flower-desktop.*.jpg` files capture only the actual scene canvas during the introductory tour; the upper bloom extends outside the original camera frame. No scene or interface content is generated or redrawn.
- **Isolation:** captures use the repository's disposable demo stack, synthetic sessions and Chrome with ANGLE Metal. No real transcript, owner credential or paid model is used. Generated fixture identifiers and camera animation can vary between runs.
- **Logo:** the existing project mark in `apps/web/public/favicon.svg`, used without modification.
- **Composition:** [`readme-hero.html`](readme-hero.html) is the editable source. The dark control-room layout places the logo and title above a complete desktop capture, with a separate Git-flower detail and phone capture on the right. All images retain their aspect ratio. Captions distinguish actual UI from synthetic demo data.
- **Languages:** open the source normally for English, or append `#zh-TW` for Traditional Chinese. This changes the captions and image inputs together. The source uses system Arial and PingFang TC; no font is distributed. The conversation examples remain English because they are source data, not interface labels.
- **Outputs:** `readme-hero.en.webp` and `readme-hero.zh-TW.webp`, 1920x1320, WebP quality 88 with metadata removed.

Render the committed source from the repository root, with Chrome and `cwebp` installed:

```sh
pnpm exec playwright screenshot --channel chrome --viewport-size '1920,1320' --wait-for-timeout 1000 "file://$PWD/docs/images/readme-hero.html" /tmp/aether-readme-hero-en.png
pnpm exec playwright screenshot --channel chrome --viewport-size '1920,1320' --wait-for-timeout 1000 "file://$PWD/docs/images/readme-hero.html#zh-TW" /tmp/aether-readme-hero-zh-TW.png
cwebp -q 88 -m 6 -metadata none /tmp/aether-readme-hero-en.png -o docs/images/readme-hero.en.webp
cwebp -q 88 -m 6 -metadata none /tmp/aether-readme-hero-zh-TW.png -o docs/images/readme-hero.zh-TW.webp
```

For new source captures, use the disposable harness below with `--hold`, select the application language, and capture the desktop conversation, mobile feed and introductory Git-flower canvas. Do not use your live stack. Inspect the results before replacing the committed inputs.

### README layout references

The layout uses a product cover, a short statement of value, a small set of useful links, and quick-start instructions before the expandable screenshot gallery. Feature, safety, support and attribution information remains text so it is searchable and accessible.

- [GitHub: About READMEs](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes) — project purpose, setup, help and repository-relative image paths.
- [Awesome README](https://github.com/matiassingers/awesome-readme) — examples combining a logo, product screenshot, concise description and installation guide. Used for layout inspiration only; no artwork or source was copied.

These images illustrate the application; they do not establish live-provider or release verification.

## Regenerate

Build first (`pnpm build`), then from the repository root, with Chrome installed (Playwright uses the `chrome` channel):

```sh
node --import tsx scripts/docs-screenshots.mjs --port 4511 --out docs/images          # all images
node --import tsx scripts/docs-screenshots.mjs --port 4511 --out docs/images --only office-overview-desktop,kpi-dashboard-desktop
node --import tsx scripts/docs-screenshots.mjs --list                                 # the ids
```

Add `--gpu` to render on the real GPU (ANGLE Metal on macOS); without it Chrome renders in software, which is slower but
shows the same content. `--hold` keeps the stack up afterwards so you can look at it by hand (Ctrl+C stops it). The script
starts a control plane and a runner on the given port (default 4511), signals only the processes it started, and removes its
temporary directory. A shot that is still above 250 KB is re-taken at a lower JPEG quality.

Two images depend on timing: the overview is taken 9 s into the first-visit tour and the crown 43 s in
(`?intro=force`, caption hidden). Look at every image before committing it: the 3D scene is alive, so a frame can land a
little differently, and no path, host name, person or token may be visible.
