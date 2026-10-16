# Repository Guidelines

## Project Structure & Module Organization

This repository is at its initial setup stage. It currently contains two empty top-level directories, `codex/` and `dsh/`. No source code, tests, assets, or package manifests are tracked yet.

Place new work in the appropriate directory and document its purpose in a local `README.md`. Keep implementation, tests, and assets together within each component. Introduce shared directories only when multiple components need the same functionality.

## Build, Test, and Development Commands

No build system, development server, or test runner is configured. Do not assume commands such as `npm test` or `make build` are available.

When adding a component, document its prerequisites and exact install, run, build, and test commands in its README. Prefer reproducible scripts over undocumented manual steps. Commit the relevant dependency manifest and lockfile when introducing a package manager.

Useful repository checks:

- `git status --short`: inspect pending changes before and after editing.
- `git diff --check`: detect whitespace errors in tracked changes.
- `git diff --stat`: review the scope of tracked changes.

## Coding Style & Naming Conventions

No language-specific style, formatter, or linter is established. Follow the conventions of the component being edited. For the first implementation, choose standard tooling for its language and commit its configuration.

Use descriptive file and directory names, consistent indentation, and small modules with clear responsibilities. Avoid mixing formatting-only changes with behavior changes. Keep configuration examples free of credentials and machine-specific paths.

## Testing Guidelines

No testing framework or coverage threshold exists yet. Add automated tests with new executable functionality and document how to run them. Use descriptive test names that identify the behavior and expected outcome, following the selected framework's discovery conventions.

Cover normal behavior, relevant edge cases, and failure handling. Include a regression test when fixing a reproducible defect.

## Commit & Pull Request Guidelines

There is no commit history from which to infer a message convention. Use concise, imperative subjects, such as `Add codex plugin configuration`, and keep each commit focused.

Pull requests should explain the purpose, affected component, and validation performed. Link related issues when available. Include screenshots for visible UI changes and call out new dependencies, configuration requirements, or breaking changes. If validation cannot run, state why.
