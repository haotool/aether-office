# Security Policy

## Supported versions

AETHER OFFICE is under active development (`0.4.0-dev`). Security fixes are made on the `main` branch; there are no
maintained release branches yet.

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Report it privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**
(private vulnerability reporting). Include what you found, how to reproduce it, the affected commit and what an
attacker could do with it.

You can expect an acknowledgement within a few days. We will keep you informed while the issue is investigated and fixed,
and credit you in the release notes if you wish.

## Scope

The threat model, the trust boundaries and what the project does and does not protect against are in
[docs/security.md](docs/security.md). In short, AETHER OFFICE is built for **one trusted operator on their own machine
or network**. Reports are especially welcome for:

- authentication, session, CSRF, Host/Origin or DNS-rebinding bypasses;
- a role performing an action the authorization matrix does not grant it;
- a way for untrusted text (a message, a transcript, a provider payload, terminal output) to reach the DOM as HTML or
  to gain filesystem, process or network abilities;
- secrets (owner, runner or MCP tokens, provider credentials) appearing in logs, events, URLs or the web bundle;
- the runner or a managed agent writing outside its workspace or the control database.

Out of scope: attacks that need an already-compromised operator account or local user, hostile multi-tenant isolation
(worktrees are not sandboxes), and denial of service by an authenticated operator.
