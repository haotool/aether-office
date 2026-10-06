# Configuration

AETHER OFFICE is configured with environment variables and, for managed execution, one local JSON file. Nothing is read
from a global location unless stated.

## Environment variables

| Variable                      | Used by         | Meaning                                                                                                    | Default                                    |
| ----------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `AETHER_MODE`                 | control, runner | `demo` (fixture data) or `live`                                                                            | `live`                                     |
| `AETHER_DATA_DIR`             | all             | Directory for the SQLite database, tokens, journals and runner state                                       | `.data/<mode>`                             |
| `PORT`                        | control         | Control-plane port (1024–65535)                                                                            | `4310`                                     |
| `AETHER_HOST`                 | control         | Address to listen on; `0.0.0.0` or `::` opens it to the local network                                      | `127.0.0.1`                                |
| `AETHER_SERVE_WEB`            | control         | Set to `0` to serve the API only                                                                           | serve the built web app                    |
| `AETHER_CONTROL_URL`          | runner          | Where the runner reaches the control plane                                                                 | `http://127.0.0.1:4310`                    |
| `AETHER_NATIVE_CONFIG`        | runner          | Path to the [native-execution file](#native-execution-file) (live mode only)                               | unset: no native execution                 |
| `AETHER_INVITATION`           | runner enroll   | One-time machine invitation for `pnpm runner:enroll`                                                       |                                            |
| `AETHER_LOCAL_SESSIONS`       | control         | Set to `off` to disable local session discovery (and its change stream)                                                            | on                                         |
| `AETHER_LOCAL_SESSIONS_HOME`  | control         | Home directory to discover sessions in (tests, containers)                                                 | the current user's home                    |
| `AETHER_CLAUDE_HOME`          | control         | Claude config directory to read the model catalog from (tests, containers)                                 | `CLAUDE_CONFIG_DIR`, else `~/.claude`      |
| `AETHER_CODEX_HOME`           | control         | Codex home to read `models_cache.json` from (tests, containers)                                            | `CODEX_HOME`, else `~/.codex`              |
| `AETHER_HOOK_SPOOL`           | control         | The hook event file                                                                                        | `~/.aether/hook-events.jsonl`              |
| `AETHER_CLAUDE_USAGE_FILE`    | control         | A file with Claude subscription limits (see [native execution](native-execution.md#claude-subscription-limits)) | the claude-hud cache, if present           |
| `AETHER_A2A`                  | control         | Set to `on` to enable the A2A gateway                                                                      | off                                        |
| `AETHER_MCP_*`                | MCP subprocess  | URL, token, project, agent, run and work of one run; set by the runner, never by hand                      |                                            |

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
