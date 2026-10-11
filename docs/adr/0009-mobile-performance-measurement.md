# ADR 0009: Relative mobile performance measurement (harness only)

- Status: accepted
- Date: 2026-10-08

## Context

Phone budgets in the design system need evidence, but Mac headless Chrome cannot stand in for Safari compositing or
device thermals. The product still needs a repeatable way to rank A/B changes.

## Decision

Relative measurement uses the harness documented in [mobile-perf.md](../quality/mobile-perf.md): `pnpm run perf:mobile`
with interleaved A/B passes, load-average discipline (≤2), and the harness output schema (section "Output schema" in that
doc). Built servers for
experiments use dedicated ports (for example 4798–4799 in the doc), not the default dev ports 4310, 4320 or 4330. On a
real phone, maintainers capture JSON with `?fieldperf=1`, implemented in `apps/web/src/features/field-perf/` (see
`is-field-perf-requested.ts`); schema `aether-field-perf/1`. These tools measure and report; they do not change runtime
budgets unless a separate product change lands.

## Consequences

- A green harness run ranks candidates on this machine; it is not proof of smoothness on every device until field reports
  exist.
- Optimizations not yet merged must not be documented as shipped; the harness doc lists known limits explicitly.
