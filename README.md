# ggb-plugins

**English** | [简体中文](README.zh-CN.md)

Turn a 2D math problem — given as text or an image — into an interactive GeoGebra file.
A host agent (Codex or DeepSeek Harness) reads the problem and writes a native Algebra/CAS
program; this project runs it locally, verifies every stated condition, exports the `.ggb`,
reloads it, and delivers the file with a verification report and a screenshot.

Chinese and English are supported. The agent picks the working language from your preferences
and context, keeps the original problem text, and never invents answers: it analyses conditions
and builds the construction only.

## What you need

| Requirement | Why |
| --- | --- |
| Codex or DeepSeek Harness (DSH) | Interprets the problem and writes the native GeoGebra program |
| Node.js 22+ with pnpm 11 | Runs the local CLI and prepares dependencies |
| `curl` and `unzip` | Download and unpack the pinned GeoGebra runtime |
| Google Chrome or Microsoft Edge | Drives the applet headless during verification |

No extra model API key is required. Installation needs network access; GeoGebra and the browser
are not redistributed with the package. Building release packages additionally uses `zip`, `tar`,
and `npm`.

## Installation

[GitHub Releases](https://github.com/Jack7510/ggb-plugins/releases) provides a Codex ZIP, a DSH
TGZ, and their checksums. Install the complete package, then prepare its runtime in the installed
copy:

- Codex: [installation and upgrade guide](codex/README.md), in Chinese.
- DSH: [independent headless profile guide](dsh/README.md), in Chinese.

The DSH bundle is also on npm: `dsh plugin --profile desktop add ggb-plugins-dsh@0.8.2`.

Desktop users can paste [one install message](dsh/README.md#用一句对话安装桌面应用) into the DSH chat instead of running the commands themselves.

The two clients install independently and share one execution and verification pipeline. Both
guides end with runtime preparation (`setup-plugin`, which also reports the browser it will use)
and a readiness check (`doctor`).

## Your first problem

Enable the plugin, start a new host session, and describe the problem. Images can be attached.

> Use GeoGebra to construct triangle ABC, mark the midpoint M of AB, and connect CM. Colour the
> median red. Drag A to verify that the midpoint and median stay linked, save the file, and open
> the interactive preview.

Construction, reload, and every automated check run headless without intermediate windows. A
condition that fails or cannot be verified blocks delivery instead of being skipped; failures keep
their diagnostics so the next attempt can be corrected. If necessary conditions are missing or
ambiguous the agent asks first, and when you do not give coordinates it explains the initial
configuration it chose. The [Skill](skills/ggb-construction/SKILL.md) defines what the agent may
and may not decide on its own.

## What you get

A successful run writes one delivery directory:

| File | Purpose |
| --- | --- |
| `<title>.ggb` | Native GeoGebra file named after the problem; open, inspect, and keep editing |
| `verification.json` | Per-condition results: construction, reload, and interaction samples |
| `preview.png` | Screenshot of the delivered configuration |
| `request.json`, `manifest.json` | Archived input and delivery manifest |

Reports state which checks ran and how far finite interaction samples reach; they never claim a
general proof.

The delivery directory sits at `<outputDir>/<title>/delivery/`. `<title>` comes from the problem
and also names the GGB file; a repeated title gets `-2`, `-3` instead of overwriting an earlier
delivery.

## Interactive preview

The preview loads the same delivered GGB and supports applicable point dragging, parameter changes,
and zooming without writing back to the delivery. Keep the preview process running (Ctrl+C ends
it); a one-shot host may terminate it on exit. Use `--headless` for automated checks.

## Use the CLI directly

Hosts call this CLI for you, but other local tools can drive it too:

```sh
node <installed-plugin>/dist/src/cli.js doctor
node <installed-plugin>/dist/src/cli.js inspect --ggb /absolute/base.ggb
node <installed-plugin>/dist/src/cli.js build --request /absolute/request.json
node <installed-plugin>/dist/src/cli.js preview --delivery /absolute/delivery
```

To change an existing GGB, declare `base` in the request: edit colours, line styles, filling, or
visibility, add objects, or update independent values and coordinates. `inspect` lists objects,
current values, and the digest the request must declare. Deleting, renaming, and view changes are
not supported. Request authoring is documented in the
[capability contract](skills/ggb-construction/references/capabilities.md), in Chinese.

## Run from source

With the requirements above installed:

```sh
pnpm install --frozen-lockfile
pnpm setup:runtime
pnpm build
pnpm demo
```

`pnpm demo` constructs the bundled triangle example into `output/`. Verification and maintenance
commands, the working rules for coding agents, and the release process live in
[AGENTS.md](https://github.com/Jack7510/ggb-plugins/blob/main/AGENTS.md); do not duplicate them here.

## Repository map

- `src/` — CLI, execution, verification, and delivery pipeline.
- `viewer/` — the local page that hosts the GeoGebra applet.
- `skills/` — the shared Skill both hosts load.
- `codex/`, `dsh/` — host-specific plugin assets, install guides, and acceptance records.
- `examples/`, `tests/` — runnable inputs and regression tests.
- `scripts/` — dependency setup, packaging, and coverage tools.
- `docs/` — [requirements and design](https://github.com/Jack7510/ggb-plugins/blob/main/docs/ggb-plugins-design.md),
  [change record](https://github.com/Jack7510/ggb-plugins/blob/main/docs/CHANGES.md), and
  cross-client validation records. Historical records are indexed in the
  [stage archive](https://github.com/Jack7510/ggb-plugins/blob/main/docs/archive/README.md).

## Scope and limits

- Supported: 2D geometry, functions, equations, calculus, lists, matrices, and statistics, in
  Chinese or English.
- Not supported: 3D construction, continuing an external GGB file you cannot declare, and general
  mathematical proofs.
- Accepting native commands does not mean every command or overload has been validated; the
  [command coverage record](skills/ggb-construction/references/command-coverage.md) states the
  boundaries.
- Numeric sampling and unresolved CAS results are evidence, not proof.

The project uses the MIT license. GeoGebra has separate licensing and attribution requirements;
see [third-party notices](THIRD_PARTY_NOTICES.md).
