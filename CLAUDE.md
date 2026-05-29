# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Internal CRM system built as a monorepo with npm workspaces. Handles customer prospecting, deal pipeline, meetings, billing, and quote generation.

## Monorepo Structure

- `packages/web` — React frontend (Vite, TanStack Router, Tailwind + shadcn/ui)
- `packages/shared` — Effect schemas and shared types
- `packages/functions` — Firebase Cloud Functions

## Commands

- `npm run dev` — Start web dev server with HMR
- `npm run build` — Build shared + web packages
- `npm run lint` — ESLint on web package
- `npm run dev -w @crm/web` — Start web dev server explicitly
- `npm run build -w @crm/shared` — Build shared package only

## Architecture

- **Entry flow**: `packages/web/index.html` → `src/main.tsx` → TanStack Router
- **Routing**: File-based routing via TanStack Router (`src/routes/`)
- **Backend**: Firebase (Firestore, Auth, Cloud Functions, Storage, Hosting)
- **Type safety**: Effect Schema (imported from `effect` package) for runtime validation + static types
- **Styling**: Tailwind CSS v4 + shadcn/ui components
- **Path alias**: `@/` maps to `packages/web/src/`

## TypeScript

Strict mode enabled. Shared base config in `tsconfig.base.json`. Each package extends it. Target ES2022 with bundler module resolution.

## Internationalization (i18n)

The app is fully internationalized with **react-i18next** (English + Swedish). Users switch language live via the sidebar footer switcher; the choice persists in `localStorage["crm-language"]`. **Default language is Swedish, fallback English.**

- **Never hardcode user-facing strings.** Every label, heading, placeholder, button, toast/error/validation message must come from a translation key.
- **Config:** `packages/web/src/i18n/config.ts` (i18next init + namespace registration). Hook + `currentLocale()` in `packages/web/src/i18n/index.ts`.
- **Translation files:** `packages/web/src/i18n/locales/{en,sv}/<namespace>.json` — **one namespace per feature** (`common`, `nav`, `auth`, `dashboard`, `customers`, `accounting`, …). Generic words (Save/Cancel/Delete/Loading/Add/Search) live in `common`.
- **Usage:** `const { t } = useTranslation("<feature>");` then `t("nested.key")`. Reuse other namespaces with `useTranslation(["feature","common"])` + `t("common:actions.save")`. Use `<Trans>` for embedded links; i18next interpolation (`{{name}}`) for variables; `_one`/`_other` suffix keys for plurals (never inline ternaries).
- **Non-component code** (utils/hooks) gets `t` via `import i18n from "@/i18n"; const t = i18n.getFixedT(null, "<ns>")`.
- **Enum labels** from `@crm/shared` (`*_LABELS`): render via `t("<ns>:status.<key>")` keyed by the enum key; do **not** translate the shared enum constants themselves.
- **Adding a key:** put the English value (exact wording) in `en/<ns>.json` and a natural Swedish translation in `sv/<ns>.json`. When adding a new namespace, register it in `config.ts`.
- **Formatting:** display number/date formatters use `currentLocale()` (sv-SE ↔ en-US) via `lib/format.ts` or directly. **Exceptions left fixed:** PDF generators (driven by each document's own `language` field) and CSV export (data serialization).
- **Tests** run in English (`src/test/setup.ts` forces `en`); English JSON values match the original wording so assertions hold. Tests needing Swedish call `i18n.changeLanguage("sv")` locally (see `lib/format.test.ts`).
- When asked to add UI in any language, still author it as i18n keys with both English and Swedish values.

## Key Patterns

- Schemas defined in `packages/shared/src/schemas/` — used by both web and functions
- Enums in `packages/shared/src/enums/`
- Feature code organized by domain in `packages/web/src/features/`
- Layout components in `packages/web/src/components/layout/`
- Firebase config via environment variables (`VITE_FIREBASE_*`)
