# Repository Guidelines

## Project Structure & Module Organization

This single TypeScript package implements M2 composable GeoGebra construction. Read `docs/ggb-plugins-design.md` for scope and `README.md` for commands. For construction requests, read `skills/ggb-construction/SKILL.md` and its capability reference.

`src/schema.ts` owns request validation and capabilities; `compile.ts` checks references and types; `browser.ts` executes operations and reads real facts; `verify.ts` evaluates facts without browser calls; `delivery.ts` exports, reloads, and previews; `cli.ts` owns arguments, output, signals, and exit codes. `server.ts` serves fixed local resources. All tasks share `viewer/index.html`.

`examples/` contains input programs, including the M1 triangle regression. Tests live in `tests/`; installation scripts live in `scripts/`. Never commit `.runtime/`, `node_modules/`, `dist/`, or `output/`. Do not depend on another checkout.

## Build, Test, and Development Commands

- `pnpm install --frozen-lockfile`: install pinned dependencies.
- `pnpm setup:runtime`: download and verify GeoGebra; requires `curl` and `unzip`.
- `pnpm exec playwright install chromium`: install the matching browser.
- `pnpm check`: check strict TypeScript types.
- `pnpm build`: compile source and tests.
- `pnpm ggb build --request <file>`: construct, verify, export, and reload a generated request.
- `pnpm demo`: run the M1 fixture through the same pipeline.
- `pnpm preview --delivery <dir>`: open a foreground preview.
- `pnpm test`: run input, graph, comparison, and resource tests.
- `pnpm test:browser`: run real GeoGebra regression tests after building.
- `GGB_HEADED=1 pnpm test:browser`: check visible preview interaction.

## Coding Style & Architecture

Use TypeScript ES modules, two-space indentation, single quotes, and `.js` local import extensions. Match surrounding code; no formatter or linter is configured. Run `git diff --check`.

Generate programs using reusable native operations and verification predicates. Never add problem-type dispatch, keyword templates, or fixed object names to production execution. New questions change input programs and checks. Keep the M1 triangle in fixtures. Avoid frameworks, service layers, and mechanical per-function file splitting.

## Testing Guidelines

Use Node's built-in runner and `*.test.ts`. Add behavioral checks and relevant counterexamples. Browser acceptance requires real applets. Destructive samples use reloaded copies and cannot alter the exported canvas. Preserve requirement coverage, reject missing evidence, and compare numerical facts with fixed tolerance. There is no coverage percentage threshold.

## Commit & Pull Request Guidelines

Use concise, imperative subjects and focused commits. Explain behavior, validation, and limitations; link issues and include screenshots for visible changes. Preserve GeoGebra attribution and licensing boundaries.
