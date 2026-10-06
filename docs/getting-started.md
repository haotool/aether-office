# Getting started

## Requirements

- Node.js **24.21.0** (`.node-version`) and the pnpm version pinned in `package.json`.
- macOS or Linux for managed terminals. Native Windows is not supported by the terminal supervisor.
- Optional: Claude Code and/or Codex CLIs for native execution (see [provider compatibility](provider-compatibility.md)),
  Blender 5.2 to change the animals.

pnpm has built-in `setup` and `doctor` commands that shadow package scripts of the same name; run this project's as
`pnpm run setup` and `pnpm run doctor`. `pnpm run doctor` reports your OS, Node, pnpm, Git and provider CLI versions.

## Try the demo

```sh
pnpm install --frozen-lockfile
pnpm build
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

Sign in with the owner token. Recent Claude Code and Codex sessions from this machine appear as observed characters.
Discovery reads session ids, working directories, file times and process information plus read-only `git status`;
transcript text is read only for the session you open, and never stored. Sessions in linked worktrees group under the
repository's Git common directory. Set `AETHER_LOCAL_SESSIONS=off` to disable discovery.

### Exact activity with hooks (optional)

Hooks tell AETHER when a session starts a tool, waits for approval or runs a subagent:

```sh
pnpm hooks install --project /path/to/repo   # writes .claude/settings.local.json in that repository
pnpm hooks remove  --project /path/to/repo
```

`--scope user` edits `~/.claude/settings.json` and affects every session on the machine; it is never the default. The
receiver records only session ids, event names, tool names, the working directory and a short target of a tool call (a
file's base name, a command's first word and a plain subcommand such as `git push`, a URL's host) in
`~/.aether/hook-events.jsonl`, never prompts, full commands, arguments, paths or other tool inputs.

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

It prints the addresses to open (for example `http://192.168.1.20:4310`). Sign in with the same owner token. Requests are
accepted only when addressed to a private-network address on the same port, so a public DNS name pointing at your
machine is refused (this is what stops DNS rebinding). The connection is plain HTTP and the token crosses the network
unencrypted: use a network you trust, or put a TLS tunnel such as Tailscale in front. See [security](security.md).

## Managed execution (optional)

Native execution runs Codex or Claude in isolated Git worktrees, started by an explicit assignment. It needs a local
configuration file and an explicit per-project opt-in. See [native execution](native-execution.md) and
[configuration](configuration.md). Nothing starts a paid model until you assign work.

## Next steps

- [Architecture](architecture.md) for how the pieces fit together.
- [Development](development.md) to contribute.
