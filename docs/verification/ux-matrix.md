# UX matrix

Unit tests cannot see a layout that overflows at 320 px, a control too small for a thumb, a blank screen or a contrast failure. The UX matrix opens every page in a real browser at seven widths, in both themes and both languages, takes a screenshot and checks the page. It also opens the states a page can be in besides "working": loading, failed, empty, offline, reduced motion, and an overlay on top.

The totals of the latest run are in `ux-matrix.json` (next to this file), stamped with the git tree ids of the code they describe. When `apps/web`, `apps/control` or `packages/{contracts,kernel,office-scene}` change, the record is stale and the release score treats it as not measured until the matrix is run again.

## What one run covers

| Part                                                       | Dimensions                                                    | Scenes per combination | Cells |
| ---------------------------------------------------------- | ------------------------------------------------------------- | ---------------------- | ----- |
| Core ([matrix.spec.ts](../../e2e/ux-matrix/matrix.spec.ts)) | 320×568, 360×640, 390×844, 820×1180, 1180×820, 1440×900, 1920×1080 × light, dark × English, Traditional Chinese | 19 | 532 |
| States ([states.spec.ts](../../e2e/ux-matrix/states.spec.ts)) | 390×844 and 820×1180 × dark with Chinese, light with English | 9 | 36 |

The 19 core scenes are the sign-in page and the 404 page when signed out, the fourteen pages (office, agents, tasks, messages, workspace, terminals, sessions, observations, reviews, approvals, knowledge, machines, history, settings), the office as a list at its top and at its end, and the 404 page when signed in. The 9 state scenes are loading, a failed projects request, no projects, a project with no sessions, offline, reduced motion (the office and settings), and on a phone the conversation sheet and the drawer, on a tablet the new-project and pair dialogs.

A run is **complete** when all 28 core combinations and all 4 state combinations ran with the same set of scenes. The matrix is the cross product of pages, widths, themes and languages. Reduced motion, offline and the overlays are state cells at one phone and one tablet size, not a further multiplier of the core matrix.

## What is checked in every cell

| Check             | Fails when                                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| Overflow          | the page is wider than the window by more than 1 px                                                                  |
| Blank             | the signed-in page shows no text (core cells)                                                                        |
| Small targets     | on a touch width (1180 px and below) a visible control is smaller than 24×24 CSS px, the minimum of WCAG 2.5.8; a checkbox inside its label counts as the label |
| axe               | a serious or critical violation of the WCAG 2.0, 2.1 and 2.2 A and AA rules (colour contrast included)                |
| Console           | a page error or a console error, except the 401 of the signed-out sign-in page and the failures a state injects on purpose |

## Run it

```bash
pnpm build
pnpm run ux:matrix                  # about 15 minutes, screenshots and index-*.json in evidence/ux
pnpm run ux:summary -- --write      # totals and tree ids into docs/verification/ux-matrix.json
```

`UX_OUT` changes the output folder, `UX_ONLY=390x844` runs one core width, and `pnpm run ux:matrix states` runs only the states. `pnpm run ux:summary` without `--write` prints the totals and `--check qa|axe|responsive` judges the record against HEAD, which is what the release gates run.

## What it does not cover

- A real phone. Emulated touch and viewport are not the field; see [mobile performance](../quality/mobile-perf.md).
- Safari and Firefox. The matrix runs in Chromium; the `webkit-iphone` Playwright project covers a smaller set.
- Screen readers, and contrast over the 3D canvas, which axe cannot sample.
- Looking at the pictures. The checks above are mechanical; a person has to read the screenshots for what looks wrong without being broken.

## Known polish items

Seen in the screenshots, none of them blocks use:

- Pickers built on a native `<select multiple>` (message recipients, task dependencies, assignees) keep the browser's own look.
- The sessions table keeps its seven columns and scrolls inside its own frame at tablet widths, by design.
