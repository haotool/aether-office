# Getting started

[Documentation](README.md) · [Project](../README.md)

<details>
<summary>Contents</summary>

- [Requirements](#requirements)
- [First run in five minutes](#first-run-in-five-minutes)
- [Try the demo](#try-the-demo)
- [Live mode: see your own sessions](#live-mode-see-your-own-sessions)
- [Connect a phone by scanning a QR code](#connect-a-phone-by-scanning-a-qr-code)
- [Open it from a phone or tablet](#open-it-from-a-phone-or-tablet)
- [Upgrading](#upgrading)
- [Capture a phone performance report](#capture-a-phone-performance-report)
- [Install it on a phone](#install-it-on-a-phone)
- [Managed execution (optional)](#managed-execution-optional)
- [Next steps](#next-steps)

</details>

## Requirements

- Node.js **24.21.0** (`.nvmrc`) and the pnpm version pinned in `package.json`.
- macOS or Linux for managed terminals. Native Windows is not supported by the terminal supervisor.
- Optional: Claude Code and/or Codex CLIs for native execution (see [provider compatibility](provider-compatibility.md)),
  Blender 5.2 to change the animals.

pnpm has built-in `setup` and `doctor` commands that shadow package scripts of the same name; run this project's as
`pnpm run setup` and `pnpm run doctor`. `pnpm run doctor` reports your OS, Node, pnpm, Git and provider CLI versions. A missing Claude Code or Codex CLI is only a warning (you need one of them to start sessions); a missing Git, pnpm or a native module that does not load fails the command. Any Claude Code or Codex version loads (there is no release list). `pnpm run doctor --strict` also fails on any warning (for CI).

## First run in five minutes

For someone who already runs `claude` or `codex` in a terminal and wants to see them.

1. **Install and build** (about a minute; `pnpm start` runs the built files, so the build is required):

   ```sh
   pnpm install --frozen-lockfile
   pnpm build
   ```

2. **Start it:**

   ```sh
   pnpm start
   ```

   The first start creates `.data/live` with the database and the owner token, and prints the token file's location (never its
   value). `pnpm run setup` does the same without starting, and is optional.

3. **Open `http://127.0.0.1:4310`** (this exact address) and paste the contents of the token file into the sign-in form
   (`cat .data/live/owner-token`). Your recent sessions appear as characters within a few seconds; the panel on the right lists them
   in groups (needs you, working, finished, idle). Click a row to read a conversation.
4. **Optional, for exact states:** `pnpm hooks install --project /path/to/a/repo` (see [below](#exact-activity-with-hooks-optional)),
   a Claude Code session that is already running may not pick up new hook settings until it is restarted.
5. **Optional, for your phone:** `AETHER_HOST=0.0.0.0 pnpm start`, then scan the QR code (see
   [Connect a phone](#connect-a-phone-by-scanning-a-qr-code)).

Nothing here starts a model or writes under `~/.claude` or `~/.codex`. To stop, press Ctrl+C in the terminal that runs
`pnpm start`; the sessions you watched are not touched.

## Try the demo

The demo uses fixture data and needs no sessions of your own. It runs the development servers, so it does not need a build:

```sh
pnpm install --frozen-lockfile
pnpm demo
```

The web UI is served at `http://127.0.0.1:4311`; the control plane and the independent fixture runner use port 4310. The
terminal prints where the owner token is stored (`.data/demo/owner-token`). Read that local file and paste its value
into the login form. Never share the token. The demo uses no paid model and labels fixture output as fixture.

To run the built artifacts instead:

```sh
pnpm run setup --demo
AETHER_MODE=demo pnpm start
# in a second terminal
AETHER_MODE=demo node apps/runner/dist/main.js
```

The built UI is then served by the control plane at `http://127.0.0.1:4310`.

## Live mode: see your own sessions

```sh
pnpm run setup        # creates the live data directory and the owner token
pnpm build
pnpm start            # AETHER_MODE defaults to live
```

Open the address the terminal prints (`http://127.0.0.1:4310`); `localhost:4310` is sent on to it, and any other host name
is refused with a JSON `HOST_FORBIDDEN` error (the host check is what stops DNS rebinding). Sign in with the owner
token. Recent Claude Code and Codex sessions from this machine appear as observed characters.
Discovery reads session ids, working directories, file times and process information plus read-only `git status`;
transcript text is read only for the session you open, and never stored. Live mode alone only _observes_: `pnpm run setup` creates no runner credential, so the terminals page, **Continue in AETHER**,
the composer and managed agents stay unavailable (the UI says why) until a runner is enrolled with `pnpm runner:enroll`
and its native file turns on `cliTerminals` (see [native execution](native-execution.md)). Sessions in linked worktrees group under the
repository's Git common directory. Set `AETHER_LOCAL_SESSIONS=off` to disable discovery.

### Exact activity with hooks (optional)

Hooks tell AETHER when a session starts a tool, waits for approval or runs a subagent:

```sh
pnpm hooks install --project /path/to/repo   # writes .claude/settings.local.json in that repository
pnpm hooks status  --project /path/to/repo
pnpm hooks remove  --project /path/to/repo
```

**What `install` changes**, and nothing else: it adds one entry per event to the project's `.claude/settings.local.json` (the
file Claude Code keeps out of Git; a copy of the previous file is kept beside it as `settings.local.json.aether-backup`). The
events are `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `SubagentStart`,
`SubagentStop`, `Stop`, `PermissionRequest` and `Notification`, each running the receiver script from this repository, which only
appends a short record to the spool file. The entries are tagged, so `pnpm hooks status --project <dir>` can report them and
`pnpm hooks remove --project <dir>` takes exactly those out again. Nothing is written to your user-level settings unless you
pass `--scope user`.

Add `--provider codex` for Codex's hooks (`.codex/hooks.json`; Codex asks you to trust them with `/hooks`).

`--scope user` edits `~/.claude/settings.json` and affects every session on the machine; it is never the default. The
receiver records only session ids, event names, tool names, the working directory and a short target of a tool call (a
file's base name, a command's first word and a plain subcommand such as `git push`, a URL's host), labels from a closed
list (`test`, `build`, `git.push.force`, `fs.rm.recursive`, ... : what kind of command it was) and whether the tool succeeded,
in `~/.aether/hook-events.jsonl`, never prompts, full commands, arguments, paths, patterns or other tool inputs. After
upgrading, run `pnpm hooks install` again so Claude Code also reports failed tools (`pnpm hooks status` lists
`PostToolUseFailure` as missing until you do); without it a failed call stays "not known" unless the transcript says so.

### Answer Claude Code permission prompts from the browser (optional)

Remote approvals is off by default. To use it, sign in as the owner, switch it on in Settings, then install the extra hook:

```sh
pnpm hooks install --remote-approvals [--wait <seconds>]   # Claude Code only; default wait 45 s
```

A permission prompt is then also shown as a card in the session panel and on the phone. Answering from a phone on plain HTTP
over the network is refused unless you use HTTPS (for example a Tailscale tunnel) or set `AETHER_REMOTE_APPROVALS_LAN=1`. The
full model is in [security](security.md#safety-properties).

## Connect a phone by scanning a QR code

With LAN access on (below), the quickest way to sign a phone in is a QR code, not the token:

```sh
AETHER_HOST=0.0.0.0 pnpm start
pnpm run pair          # prints one QR code in the terminal
```

The control plane prints the same QR code when it starts with `AETHER_HOST` set, and the top bar's **Open on your phone**
button shows it from any page. Scan it with the phone's camera (same Wi-Fi). The QR code is for the best address of this computer (a 192.168.x or 10.x
address on a real network interface; tunnels, containers and link-local addresses are skipped); any other addresses are
listed beside it and carry the same code. Or sign in on the computer and use **Open on your phone** in the top bar, which shows
the QR code, lets you switch the address it points at, and tells you when the phone has used it. A code works **once** and expires in **five minutes**; the code is
carried in the link's fragment, which a browser never sends over the network, so it is in no server log. The phone is
remembered for 30 days. On the sign-in page, "Remember this device" does the same for a typed token (otherwise a session
lasts 8 hours).

## Open it from a phone or tablet

By default the control plane listens on this machine only. To use it from another device on the same network:

```sh
AETHER_HOST=0.0.0.0 pnpm start
```

It prints the addresses to open (for example `http://192.0.2.20:4310`). Sign in with the same owner token. Requests are
accepted only when addressed to a private-network address on the same port, so a public DNS name pointing at your
machine is refused (this is what stops DNS rebinding). The connection is plain HTTP and the token crosses the network
unencrypted: use a network you trust, or put a TLS tunnel such as Tailscale in front. See [security](security.md).

### macOS login service

For an existing `com.haotool.aether-office` LaunchAgent, set `AETHER_HOST` to `0.0.0.0` in the
plist's `EnvironmentVariables` dictionary. The service reads its environment from the plist when launched; an export in
a terminal does not change the running login service. Keep its working directory and data directory as configured.
Reload the existing service after saving the plist:

```sh
launchctl bootout "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.haotool.aether-office.plist"
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.haotool.aether-office.plist"
```

Then reopen **Open on your phone** to generate a fresh QR code. If it still says local connections only, check the
running service's environment with `launchctl print "gui/$(id -u)/com.haotool.aether-office"`.

## Upgrading

Pull, then `pnpm install --frozen-lockfile` and `pnpm build`, and **restart the control plane** (`pnpm start`). The running
server keeps the code it started with, so until it is restarted it answers an updated page in the older shape. After an update that changes
Remote approvals, switch it off and on again in Settings and reinstall the hook (`pnpm hooks install --remote-approvals`); the
configuration file gained a `verifyKey`, and the hook falls back to the terminal prompt until it has one.

## Capture a phone performance report

When investigating mobile PWA stutter, maintainers need numbers from a real phone. The app can build a JSON report locally
(nothing is uploaded). Opt in with `?fieldperf=1` on the address (exact value `1`; the scene frame probe still uses `?perf=N`
separately). Without `fieldperf=1` the report code is not loaded.

1. On your Mac, start the control plane so the phone can reach it: `AETHER_HOST=0.0.0.0 pnpm start` (same as
   [Open it from a phone or tablet](#open-it-from-a-phone-or-tablet) below).
2. On the phone (Safari or Chrome, or the home-screen icon after **Add to Home Screen**), open the printed address with
   `/?fieldperf=1` appended (for example `http://192.0.2.20:4310/?fieldperf=1`). Use the office for about two minutes: scroll the feed,
   open a session, change floors. For a cold start, force-quit the browser or the installed app, open the same link again and
   use it for about one minute.
3. Tap **Copy report** on the small panel (after a few seconds of collection). Paste the JSON into an issue or audit evidence.
   Fields the browser cannot measure are `null` and listed under `unsupported`.

The JSON includes a full **User-Agent** string (for device and browser identification), timing and WebGL probe
fields, and `/api` fetch counts. It does **not** include project names, conversation text, URL paths, or account
identifiers.

## Install it on a phone

The office is an installable web app: opened from the home screen it runs full screen, with its own icon, and the shortcuts
(long-press the icon) go straight to Sessions and Approvals.

- **Android (Chrome, Edge, Samsung Internet):** the page shows an **Install** button, or use the browser menu, Install app.
- **iPhone and iPad (Safari):** tap Share, then **Add to Home Screen**. The page shows these steps once (dismiss them and
  they stay away). iOS has no install button for a web page to call.
- **Desktop Chrome and Edge:** the install icon in the address bar.

**Plain HTTP on the network cannot be installed as a full app and gets no offline shell or update prompt.** Service workers
(which those need, and Web Push would) work only in a _secure context_: `https://`, or `localhost` / `127.0.0.1`.
A phone that opens `http://192.0.2.20:4310` still gets the whole office (and Add to Home Screen on iOS gives it its icon
and full-screen mode), but the page registers nothing and says nothing about it. To get the rest, serve the office over HTTPS:

The control plane accepts only requests addressed to `127.0.0.1:4310` or, with `AETHER_HOST` set, to a private-network
address on its own port (the DNS-rebinding guard, see [security](security.md)). A TLS proxy in front therefore has to
present the request to it as `127.0.0.1:4310`. `tailscale serve` on its own has no setting to rewrite the Host header (not tried here), so
use a proxy that can, such as Caddy, and take the certificate from wherever suits you:

```
# Caddyfile: office.example, or <machine>.<tailnet>.ts.net with `tailscale cert`, or an address with mkcert
office.example {
  tls internal                       # or: tls /path/to/cert.pem /path/to/key.pem
  @own header Origin https://office.example
  handle @own {
    reverse_proxy 127.0.0.1:4310 {
      header_up Host 127.0.0.1:4310
      header_up Origin http://127.0.0.1:4310
    }
  }
  handle {
    reverse_proxy 127.0.0.1:4310 { header_up Host 127.0.0.1:4310 }
  }
}
```

If the proxy runs on the same machine, start the control plane with `AETHER_TRUST_PROXY=127.0.0.1` (Caddy sets `X-Forwarded-For` and
`X-Forwarded-Proto` itself): sign-in limits then count each client separately and the session cookie becomes `Secure`.
The `Origin` rewrite is limited to the proxy's own address, so a request from another web site still carries a foreign
Origin and is refused, as before. (This recipe follows the Caddy and control-plane code; it has not been run end to end here.)

| Certificate                     | What to do                                                                                                                                                                                                                  | Trade-off                                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Caddy's own CA (`tls internal`) | Trust Caddy's root certificate on the phone.                                                                                                                                                                                | Works on the LAN alone; every phone has to trust the CA.                                              |
| mkcert                          | `mkcert -install`, `mkcert office.example`, point `tls` at the files, send `rootCA.pem` (`mkcert -CAROOT`) to the phone and trust it (iOS: install the profile, then Settings, General, About, Certificate Trust Settings). | The CA key must stay private.                                                                         |
| Tailscale                       | Turn on MagicDNS and HTTPS certificates in the admin console, `tailscale cert <machine>.<tailnet>.ts.net`, point `tls` at the files.                                                                                        | A publicly trusted certificate, so nothing to install on the phone; reachable only from your tailnet. |

If a service worker ever misbehaves, open the office once with `?sw=off`: the worker and its caches are removed from that
browser and it stays off (`?sw=on` turns it back on).

## Managed execution (optional)

Native execution runs Codex or Claude in isolated Git worktrees, started by an explicit assignment. It needs a local
configuration file and an explicit per-project opt-in. See [native execution](native-execution.md) and
[configuration](configuration.md). Nothing starts a paid model until you assign work.

## Next steps

- [Architecture](architecture.md) for how the pieces fit together.
- [Development](development.md) to contribute.
