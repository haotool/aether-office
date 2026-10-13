# Screenshots

[Documentation](../README.md) · [Project](../../README.md)

Every image here is a JPEG of at most 250 KB, taken from a throwaway demo stack on **synthetic data**: invented repositories
(`harbor-web`, `ledger-api`, ...), authors, conversations and token counts, fake `claude` processes (`sleep`, named
`claude`) and hook records. Nothing is read from a real `~/.claude` or `~/.codex`, no model is called, and the stack and its
data directory are deleted afterwards. The LAN address in the pairing image is a stand-in (a private-range example); the QR code in
it belongs to the deleted stack and works nowhere. The interface is shown in English, dark theme unless the name says light.

| File                                | Size        | Shows                                                                                                  |
| ----------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------ |
| `office-overview-desktop.jpg`       | 1440x900    | The building, the Git beanstalk with its flower crown and the live session panel (README)              |
| `office-overview-desktop-light.jpg` | 1440x900    | The same in the light theme                                                                            |
| `office-crown-desktop.jpg`          | 1440x900    | The crown close up: one flower per twelve commits, a great bloom on top (exploded view)                |
| `session-conversation-desktop.jpg`  | 1440x900    | A conversation with Markdown, a table, folded tool calls, a squad strip and subagent activity (README) |
| `approval-card-desktop.jpg`         | 1440x900    | A permission request as a card (Remote approvals on) (README)                                          |
| `kpi-dashboard-desktop.jpg`         | 1440x900    | The KPI dashboard for the building, 7 days (README)                                                    |
| `squad-strings-desktop.jpg`         | 1440x900    | A squad around its supervisor's desk with puppet strings; stand-in subagents (`?squad=4`) (README)     |
| `character-menu-desktop.jpg`        | 1440x900    | A character's action menu, with the disabled items and why (README)                                    |
| `settings-office-desktop.jpg`       | 1440x900    | Settings, Office group                                                                                 |
| `connect-phone-desktop.jpg`         | 1440x900    | The "Connect a phone" dialog with its QR code                                                          |
| `office-phone.jpg`                  | 390x844 @2x | The office on a phone with a pending approval (README)                                                 |
| `sessions-phone.jpg`                | 390x844 @2x | The live sessions bottom sheet (README)                                                                |
| `conversation-phone.jpg`            | 390x844 @2x | A conversation in the bottom sheet                                                                     |

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
