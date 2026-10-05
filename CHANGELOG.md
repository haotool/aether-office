# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) once it has a stable release.

## [Unreleased]

Pre-release development (`0.4.0-dev`).

### Added

- Control plane (Fastify, SQLite) with roles, idempotent commands, an event log, tasks, messages, rooms, reviews, approvals,
  schedules, knowledge review, skills, integrations, A2A gateway, backups and a typed HTTP API.
- Independent runner: Git worktrees, Codex and Claude native execution, MCP tools, interactive terminals, read-only
  observation, verifiers and a durable journal.
- Read-only discovery of local Claude Code and Codex sessions, with liveness (active, idle, dormant, orphaned, zombies), role
  classification, hooks, and one-tap stop and zombie-reap actions.
- Terminal agent-state detection (working, waiting for you, idle) from the bottom of a managed terminal's screen.
- 3D office with eight animal characters, a ghost and a jiangshi, a camera director, communication links and a screen on each
  desk that shows what the session is really doing.
- Responsive React workbench for desktop, tablet and phone, including a full-screen 3D phone layout, with a token-based design
  system and a lint that enforces it.
- Blender pipeline for the animals with a desk-and-chair clipping audit, a loop-seam check and a review renderer.
- Pair a phone by scanning a QR code (`pnpm run pair` or Settings): one-time, five-minute, server-enforced; a remembered device keeps
  its session for 30 days; the animal models download 30% lighter.
- Claude subscription limits in the top bar, read from an existing local file.
- Verification ledger and generated report.

- Members working hard type faster, their screens stream and, flat out, smoke and spark; screens are themed per department; the
  director cuts faster with many busy members and wide screens show up to three picture-in-picture views of the others.

### Changed

- Seated arms rest naturally on the desk; gestures no longer start with the arm doubled up; tails are smooth tubes with five
  bones and no longer pass through the chair.
- The upstream agent-office application was removed from the tree; its attribution is kept in THIRD_PARTY_NOTICES.md.

### Security

- Host/Origin allow-list for local-network access, CSRF protection, scoped per-run MCP credentials, secret redaction,
  SSRF-guarded outbound fetches, no permission bypass.
