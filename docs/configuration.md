# Configuration

AETHER OFFICE is configured with environment variables and, for managed execution, one local JSON file. Nothing is read
from a global location unless stated.

## Environment variables

| Variable                      | Used by                | Meaning                                                                                                                                                          | Default                                            |
| ----------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `AETHER_MODE`                 | control, runner        | `demo` (fixture data) or `live`                                                                                                                                  | `live`                                             |
| `AETHER_DATA_DIR`             | all                    | Directory for the SQLite database, tokens, journals and runner state                                                                                             | `.data/<mode>`                                     |
| `PORT`                        | control                | Control-plane port (1024–65535)                                                                                                                                  | `4310`                                             |
| `AETHER_HOST`                 | control                | IP address to listen on; `0.0.0.0` or `::` opens it to the local network                                                                                         | `127.0.0.1`                                        |
| `AETHER_SERVE_WEB`            | control                | Set to `0` to serve the API only                                                                                                                                 | serve the built web app                            |
| `AETHER_CONTROL_URL`          | runner                 | Where the runner reaches the control plane                                                                                                                       | `http://127.0.0.1:4310`                            |
| `AETHER_NATIVE_CONFIG`        | runner                 | Path to the [native-execution file](#native-execution-file) (live mode only)                                                                                     | unset: no native execution                         |
| `AETHER_INVITATION`           | runner enroll          | One-time machine invitation for `pnpm runner:enroll`                                                                                                             |                                                    |
| `AETHER_LOCAL_SESSIONS`       | control                | Set to `off` to disable local session discovery, its change stream, speech and the composer endpoints                                                            | on                                                 |
| `AETHER_LOCAL_SESSIONS_HOME`  | control                | Home directory to discover sessions in (tests, containers)                                                                                                       | the current user's home                            |
| `AETHER_CLAUDE_HOME`          | control                | Claude config directory to read the model catalog from (tests, containers)                                                                                       | `CLAUDE_CONFIG_DIR`, else `~/.claude`              |
| `AETHER_CODEX_HOME`           | control                | Codex home to read `models_cache.json` from (tests, containers)                                                                                                  | `CODEX_HOME`, else `~/.codex`                      |
| `CLAUDE_CONFIG_DIR`           | control                | The Claude Code variable of the same name; also where the subscription-limits cache is looked for                                                                | `~/.claude`                                        |
| `AETHER_HOOK_SPOOL`           | control, hook receiver | The hook event file                                                                                                                                              | `~/.aether/hook-events.jsonl`                      |
| `AETHER_CLAUDE_USAGE_FILE`    | control                | A file with Claude subscription limits (see [native execution](native-execution.md#claude-subscription-limits))                                                  | the claude-hud cache, if present                   |
| `AETHER_A2A`                  | control                | Set to `on` to enable the A2A gateway                                                                                                                            | off                                                |
| `AETHER_REMOTE_APPROVALS_LAN` | control                | Set to `1` to let a person answer [Remote approvals](security.md#safety-properties) over plain HTTP on the network (the session cookie then travels unencrypted) | unset: answering is refused off loopback and HTTPS |
| `AETHER_APPROVALS_CONFIG`     | control, approval hook | Path of the Remote approvals file (hook token and verify key, mode 0600)                                                                                         | `~/.aether/approvals.json`                         |
| `AETHER_APPROVAL_WAIT_MS`     | approval hook          | How long the hook waits for an answer, in milliseconds (at least 1000); `pnpm hooks install --remote-approvals --wait <seconds>` sets it per install             | `45000`                                            |
| `AETHER_MCP_*`                | MCP subprocess         | URL, token, project, agent, run and work of one run; set by the runner, never by hand                                                                            |                                                    |
| `AETHER_E2E_LAN_ADDRESSES`    | e2e only               | Addresses that stand in for the machine's own, so pairing links and the LAN rules can be tested while listening on loopback                                      | unset                                              |
| `AETHER_WEBKIT`               | e2e only               | Set to `1` to add the WebKit (iPhone) project to the Playwright run                                                                                              | unset                                              |

`CODEX_HOME` is the Codex CLI's own variable; AETHER reads it only as the fallback of `AETHER_CODEX_HOME`. `pnpm run pair`
reads `AETHER_DATA_DIR` (for the owner token), `AETHER_CONTROL_URL` and `PORT` (to find the server; `--demo` selects the demo data
directory), so run it with the same values as the server.

**Tests and tooling only** (never needed to run the product): `AETHER_TEST_BUILT` (lets `mcp.test.ts` use the built runner),
`AETHER_TEST_PROVIDER_TOKEN` (a synthetic secret in `secret-hygiene.test.ts`), `AETHER_RUNNER_TOKEN` (a synthetic value the
PTY and workspace tests plant to prove it never reaches a child process), `AETHER_SCAN_BUDGET_OUT` and
`AETHER_SCAN_BUDGET_SUBAGENTS` (`scan-budget.test.ts`), `PERF_GPU`, `PERF_BASELINE`, `PERF_VARIANT`, `PERF_ROUNDS` and `PERF_FRAMES`
(the GPU perf specs), and `AETHER_ASSET_BUILT` and `AETHER_RENDER_COMPLETE`, which the Blender scripts print as markers.

The control plane stores the owner token in the data directory and prints its location, never its value.

## Native-execution file

A runner starts agents only when `AETHER_NATIVE_CONFIG` points at a JSON file with `"enabled": true`. The file is local to
the machine and is never uploaded. Each project owner must additionally enable execution in the project's settings.

```json
{
  "enabled": true,
  "repositories": ["/absolute/path/to/your/repository"],
  "binaries": {
    "codex": "/absolute/path/to/codex",
    "claude": "/absolute/path/to/claude"
  }
}
```

Omit a provider you do not use. Only verified releases are accepted ([provider compatibility](provider-compatibility.md)).
Further optional sections (`verifiers`, `terminals`, `cliTerminals`, `observations`) are described in
[native execution](native-execution.md).
