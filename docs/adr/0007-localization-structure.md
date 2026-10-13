# ADR 0007: Traditional Chinese and English locale tables

[Documentation](../README.md) · [Project](../../README.md)

- Status: accepted
- Date: 2026-10-08

## Context

The workbench serves operators in English and Traditional Chinese. Missing keys or runtime-only bilingual strings are hard
to test and inflate bundles.

## Decision

The web app loads two locale tables: `apps/web/src/locales/en.ts` and `apps/web/src/locales/zh.ts`, composed from
per-domain modules under `locales/en/` and `locales/zh/`. `apps/web/src/lib/i18n/i18n.ts` defines `Key = keyof typeof zh`
and `Table = Record<Key, string>` so every UI string key must exist in both languages before ship (parity checks in
`pnpm run quality`). Components read copy through `apps/web/src/ui/useT.ts` (`translate(locale, key)`). The 3D scene
package does not duplicate those tables: it receives `locale: 'zh-TW' | 'en'` on scene props and uses localized strings
inside `packages/office-scene` (for example squad and life aria lines keyed off `locale === 'zh-TW'`). First-run language
follows `resolveLocale(navigator.language)` in `i18n.ts`.

## Consequences

- Adding UI text means updating both locale trees; the scene stays free of web locale imports, preserving lazy loading of
  Three.js without pulling entire string tables into unrelated chunks.
