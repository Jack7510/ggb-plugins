# Repository Guidelines

## Project Structure & Module Organization

M4 packages GeoGebra construction for Codex. Read `docs/ggb-plugins-design.md` and `README.md`. For construction, read `skills/ggb-construction/SKILL.md`.

`src/schema.ts` owns request validation and capabilities; `compile.ts` checks references and types; `browser.ts` executes operations and reads real facts; `verify.ts` evaluates facts without browser calls; `delivery.ts` exports, reloads, and previews; `cli.ts` owns arguments, output, signals, and exit codes. `doctor.ts` checks readiness through the same browser APIs. `server.ts` serves fixed local resources. Tasks share `viewer/index.html`.

`examples/` contains input programs, including the M1 triangle regression. Tests live in `tests/`; packaging and installation scripts live in `scripts/`. Manifests are `plugin.json` and `.agents/plugins/marketplace.json`. Do not commit `.runtime/`, `node_modules/`, `dist/`, or `output/`, or depend on another checkout.

## Build, Test, and Development Commands

- `pnpm install --frozen-lockfile`: install pinned dependencies.
- `pnpm setup:runtime`: download and verify GeoGebra; requires `curl` and `unzip`.
- `pnpm exec playwright install chromium`: install the matching browser.
- `pnpm check`: check strict TypeScript types.
- `pnpm build`: compile source and tests.
- `pnpm ggb doctor`: check dependencies and real GGB export/reload, then close resources.
- `pnpm ggb build --request <file>`: construct, verify, export, and reload a generated request.
- `pnpm pack:plugin`: compile and package a standalone plugin ZIP.
- `pnpm preview --delivery <dir>`: open a foreground preview.
- `pnpm test`: run input, graph, comparison, and resource tests.
- `pnpm test:browser`: run real GeoGebra regression tests after building.
- `pnpm setup:plugin`: prepare dependencies and run doctor in the installed copy.

## Coding Style & Architecture

Use TypeScript ES modules, two-space indentation, single quotes, and `.js` local import extensions. Match surrounding style; no formatter/linter is configured. Run `git diff --check`.

Use reusable operations and predicates. Never add problem-type dispatch, keyword templates, or fixed object names to production execution. New questions change inputs. Keep M1 in fixtures. Avoid frameworks, service layers, and mechanical file splitting.

## Testing Guidelines

Use Node's built-in runner and `*.test.ts`. Fault injection stays in tests using Node module mocks; never add production fault switches. Add behavioral checks and relevant counterexamples. Use real headless applets and save screenshots. Open only the final preview in Google Chrome; automated previews use --headless. Samples use reloaded copies; preserve the exported canvas. Require coverage and evidence; compare numbers with fixed tolerance. Commit delivery only after cleanup. A post-commit journal error cannot invalidate delivery. No coverage threshold.

## Commit & Pull Request Guidelines

Use imperative subjects and focused commits. Explain behavior, validation, and limitations; link issues and include screenshots for visible changes. Preserve GeoGebra licensing and attribution.
