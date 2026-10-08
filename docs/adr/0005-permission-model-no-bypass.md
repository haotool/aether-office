# ADR 0005: No permission bypass; remote approvals with explicit timeouts

- Status: accepted
- Date: 2026-10-08

## Context

Coding agents run with the operator's privileges. The platform must not silently widen tool approval, and network-facing
endpoints must not let another site or host drive mutations.

## Decision

There is no global "auto-approve everything" mode. Tool approvals bind to one request and session; the authorization
matrix in `packages/kernel` is pinned by tests so roles cannot gain actions silently. Remote approvals (Claude Code hooks
posting to `POST /api/hook/permission-requests`) require the hook bearer token, Remote approvals enabled, and—when the
browser is not on loopback—`AETHER_REMOTE_APPROVALS_LAN=1` (`approvalChannel` in `apps/control/src/services/remote-approvals.ts`
returns `REMOTE_APPROVALS_LAN_DISABLED` otherwise). Hook routes are listed in `PUBLIC_ROUTES` in `apps/control/src/server.ts`
but each validates its own credential. Pairing a phone uses a one-time code in the URL fragment (`POST /api/pairings/redeem`),
not the owner token in a QR query string.

## Consequences

- Operators opt in explicitly for LAN remote approvals and for hook installation; defaults stay on loopback.
- Security detail lives in [security.md](../security.md); this ADR records the non-negotiable "no bypass" property only.
