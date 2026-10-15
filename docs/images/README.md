# Screenshots

[Documentation](../README.md) · [Project](../../README.md)

The English and Traditional Chinese README heroes are 1920x1320 WebP compositions; their source record is below. Every screenshot here is a JPEG
of at most 250 KB, taken from a throwaway demo stack on **synthetic data**: invented repositories
(`harbor-web`, `ledger-api`, ...), authors, conversations and token counts, fake `claude` processes (`sleep`, named
`claude`) and hook records. Nothing is read from a real `~/.claude` or `~/.codex`, no model is called, and the stack and its
data directory are deleted afterwards. The LAN address in the pairing image is a stand-in (a private-range example); the QR code in
it belongs to the deleted stack and works nowhere. Session, repository, conversation and token data are synthetic; sidebar CPU, memory and disk figures are local host readings at capture time. The interface is shown in English, dark theme unless the name says light or ends in `zh-TW`. Synthetic conversation content keeps its original language even when the application chrome is Traditional Chinese.

| File                                                                             | Pixels    | View and use                                                                                           |
| -------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------ |
| [approval-card-desktop.jpg](approval-card-desktop.jpg)                           | 1440x900  | Earlier approval-workflow reference capture                                                            |
| [character-menu-desktop.jpg](character-menu-desktop.jpg)                         | 1440x900  | Earlier character action menu reference capture                                                        |
| [connect-phone-desktop.jpg](connect-phone-desktop.jpg)                           | 1440x900  | Earlier pairing dialog with a deleted-stack QR code                                                    |
| [conversation-phone.jpg](conversation-phone.jpg)                                 | 780x1688  | English webhook-retry conversation, tool history and agent reply; English README                       |
| [conversation-phone.zh-TW.jpg](conversation-phone.zh-TW.jpg)                     | 780x1688  | Traditional Chinese webhook-retry conversation without the previous focus outline; Chinese README      |
| [git-flower-desktop.en.jpg](git-flower-desktop.en.jpg)                           | 806x578   | Current English scene-only Git-flower capture; English hero                                            |
| [git-flower-desktop.zh-TW.jpg](git-flower-desktop.zh-TW.jpg)                     | 806x575   | Current Traditional Chinese scene-only Git-flower capture; Chinese hero                                |
| [kpi-dashboard-desktop.jpg](kpi-dashboard-desktop.jpg)                           | 1440x900  | English desktop token and Git dashboard; English README                                                |
| [kpi-dashboard-desktop.zh-TW.jpg](kpi-dashboard-desktop.zh-TW.jpg)               | 1440x900  | Traditional Chinese desktop token and Git dashboard; Chinese README                                    |
| [kpi-phone.en.jpg](kpi-phone.en.jpg)                                             | 780x1688  | English mobile KPI bottom sheet, token composition and daily chart; English README                     |
| [kpi-phone.zh-TW.jpg](kpi-phone.zh-TW.jpg)                                       | 780x1688  | Traditional Chinese mobile KPI bottom sheet; Chinese README                                            |
| [office-crown-desktop.jpg](office-crown-desktop.jpg)                             | 1440x900  | Earlier English flower crown and exploded building view; both README galleries                         |
| [office-overview-desktop-light.jpg](office-overview-desktop-light.jpg)           | 1440x900  | Earlier English light-theme wide shot; both README galleries                                           |
| [office-overview-desktop.jpg](office-overview-desktop.jpg)                       | 1440x900  | Earlier English dark-theme wide shot of the multi-floor building and Git flower; both README galleries |
| [office-phone.jpg](office-phone.jpg)                                             | 780x1688  | English mobile 3D squad close-up; English README and hero                                              |
| [office-phone.zh-TW.jpg](office-phone.zh-TW.jpg)                                 | 780x1688  | Traditional Chinese mobile 3D squad close-up; Chinese README and hero                                  |
| [readme-hero.en.webp](readme-hero.en.webp)                                       | 1920x1320 | English control-room cover; logo, desktop conversation, Git flower and mobile 3D office                |
| [readme-hero.zh-TW.webp](readme-hero.zh-TW.webp)                                 | 1920x1320 | Traditional Chinese control-room cover with matching application chrome                                |
| [session-conversation-desktop.jpg](session-conversation-desktop.jpg)             | 1440x900  | Current English desktop conversation and tool activity; English README and hero                        |
| [session-conversation-desktop.zh-TW.jpg](session-conversation-desktop.zh-TW.jpg) | 1440x900  | Current Traditional Chinese desktop conversation; Chinese README and hero                              |
| [sessions-list-phone.en.jpg](sessions-list-phone.en.jpg)                         | 780x1688  | English full Sessions page, running-only filter disabled; English README                               |
| [sessions-list-phone.zh-TW.jpg](sessions-list-phone.zh-TW.jpg)                   | 780x1688  | Traditional Chinese full Sessions page, running-only filter disabled; Chinese README                   |
| [sessions-phone.jpg](sessions-phone.jpg)                                         | 780x1688  | English half-height office feed; retained reference capture                                            |
| [sessions-phone.zh-TW.jpg](sessions-phone.zh-TW.jpg)                             | 780x1688  | Traditional Chinese half-height office feed; retained reference capture                                |
| [settings-office-desktop.jpg](settings-office-desktop.jpg)                       | 1440x900  | Earlier office-settings reference capture                                                              |
| [squad-strings-desktop.jpg](squad-strings-desktop.jpg)                           | 1440x900  | English supervisor, subagent squad and camera views; English README                                    |
| [squad-strings-desktop.zh-TW.jpg](squad-strings-desktop.zh-TW.jpg)               | 1440x900  | Traditional Chinese squad and camera views; Chinese README                                             |

The [editable hero source](readme-hero.html) is HTML, not a screenshot. Mobile captures are 390x844 at 2x (780x1688 pixels). Each README gallery now contains ten images: three earlier wide/crown views, three current desktop feature views and four current mobile views. The full Sessions-page capture has the running-only filter turned off, so it does not imply that a filtered subset is the complete list. Earlier English application chrome is explicitly labeled in both galleries.

## Hero provenance

- **Sources:** `session-conversation-desktop.jpg` and `office-phone.jpg` were refreshed from the current application. Their `zh-TW` counterparts were captured with the application locale set to Traditional Chinese. Both `git-flower-desktop.*.jpg` files capture only the actual scene canvas during the introductory tour; the upper bloom extends outside the original camera frame. No scene or interface content is generated or redrawn.
- **Isolation:** captures use the repository's disposable demo stack, synthetic sessions and Chrome with ANGLE Metal. No real transcript, owner credential or paid model is used. Generated fixture identifiers and camera animation can vary between runs.
- **Logo:** the existing project mark in `apps/web/public/favicon.svg`, used without modification.
- **Composition:** [`readme-hero.html`](readme-hero.html) is the editable source. The dark control-room layout places the logo and title above a complete desktop capture, with a separate Git-flower detail and mobile 3D-office capture on the right. All images retain their aspect ratio. Captions distinguish actual UI from synthetic demo data.
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

The layout uses a product cover, a short statement of value, a small set of useful links, and quick-start instructions before the expandable screenshot gallery. The gallery has a linked five-part list and full-width desktop figures; the four phone captures are grouped in two rows. Feature, safety, support and attribution information remains text so it is searchable and accessible.

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
