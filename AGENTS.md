# Repository Guidelines

## Project Structure & Module Organization

This repository currently implements the M1 GeoGebra prototype, not the complete plugin. Read `docs/ggb-plugins-design.md` for planned scope and `README.md` for implemented behavior.

Keep this a single TypeScript package. `src/cli.ts` handles arguments, JSON output, signals, and exit codes; `server.ts` serves local assets; `browser.ts` owns Playwright and applet lifecycle; `triangle.ts` constructs and checks the fixed example; `delivery.ts` exports, reloads, and previews files. Construction and preview share `viewer/index.html`. Tests live in `tests/`; the installer lives in `scripts/`.

Do not commit `.runtime/`, `node_modules/`, `dist/`, or generated `output/`. Do not introduce dependencies on another checkout.

## Build, Test, and Development Commands

- `pnpm install --frozen-lockfile`: install pinned dependencies.
- `pnpm setup:runtime`: download and verify the pinned GeoGebra bundle; requires `curl` and `unzip`.
- `pnpm exec playwright install chromium`: install the matching browser.
- `pnpm check`: run strict TypeScript checks.
- `pnpm build`: compile source and tests into `dist/`.
- `pnpm demo`: construct the fixed triangle and median, verify, export, and reload.
- `pnpm preview --delivery <dir>`: open an interactive foreground preview.
- `pnpm test`: check resource-server boundaries and cleanup.
- `pnpm test:browser`: run real GeoGebra regression checks after building.

## Coding Style & Naming Conventions

Use TypeScript ES modules, two-space indentation, single quotes, and `.js` extensions for local imports. Use descriptive camelCase function names. No formatter or linter is configured; match surrounding code and run `git diff --check`.

Keep resource lifecycle, geometry checks, and file delivery cohesive. Avoid generic frameworks, services, or configuration layers until actual functionality requires them.

Generate programs using reusable GeoGebra operations and verification predicates. Do not add problem-type dispatch, keyword templates, or hardcoded object names to production execution. Keep the M1 triangle as a regression fixture; M2 must run different constructions through the same pipeline.

## Testing Guidelines

Use Node's built-in test runner with `*.test.ts` files. Add behavioral regression checks for meaningful changes. Browser tests require the real installed runtime and Chromium; mocks cannot establish final construction correctness. No coverage threshold is set.

Verify both object relationships and dependencies. Keep destructive interaction checks on disposable reloaded applets. Never accept static coordinates as evidence of dynamic construction.

## Commit & Pull Request Guidelines

Use concise, imperative commit subjects, following the existing `Add ...` convention. Keep commits focused. Pull requests should explain behavior, scope, validation, and remaining limitations; link related issues and include screenshots for visible changes. Preserve GeoGebra attribution and third-party licensing boundaries.
