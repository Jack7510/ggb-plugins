# ggb-plugins

**English** | [简体中文](README.zh-CN.md)

Turn a 2D math problem, given as text or an image, into an interactive GeoGebra file. Supports Codex and DeepSeek Harness (DSH): the host agent interprets the problem and writes native Algebra/CAS commands; the local tool executes, verifies, exports, and reloads them to deliver a `.ggb` file, a verification report, and a screenshot.

Chinese and English are supported. The agent chooses the working language from your preferences and context, including explanations and diagram text. Original problem statements and condition sources are preserved.

The plugin adds no model service or extra model API key. New problems use different programs and checks, covering geometry, functions, equations, calculus, lists, matrices, and statistics. External GGB continuation, 3D construction, and general mathematical proofs are outside the current scope. Accepting native commands does not mean every command or overload has been validated.

## Installation

[GitHub Releases](https://github.com/Jack7510/ggb-plugins/releases) provides a Codex ZIP, a DSH TGZ, and checksums. Install the complete package and prepare its runtime dependencies:

- Codex: [installation and upgrade guide](docs/installation.md), in Chinese.
- DSH: [independent headless profile guide](dsh/README.md), in Chinese.

Each client installs independently and uses the same execution and verification pipeline. For source development, start with [AGENTS.md](https://github.com/Jack7510/ggb-plugins/blob/main/AGENTS.md). Supporting documentation remains in Chinese.

## Submit a problem

After enabling the plugin, start a new host session and describe the problem. You can attach an image. For example:

> Use GeoGebra to construct triangle ABC, mark the midpoint M of AB, and connect CM. Color the median red. Drag A to verify that the midpoint and median update, save the file, and open the interactive preview.

The plugin analyzes given conditions and construction methods without providing answers to the problem. For example, ask: “Plot y=x²−5x+6 for exploration without giving the roots.” The agent asks when necessary conditions are missing or ambiguous. If you do not specify coordinates, it explains the initial configuration it chooses. See the [Skill output boundary](skills/ggb-construction/SKILL.md).

Construction, reloading, and automated checks run headless, without intermediate windows. Failures retain diagnostics. A required condition that fails or remains unverified blocks delivery. Successful reports state the checks performed and the scope of finite interaction samples.

## Delivery and preview

A successful run produces a complete delivery directory:

| File | Purpose |
| --- | --- |
| result.ggb | Native GeoGebra file that you can open and edit |
| verification.json | Mathematical, reload, and interaction verification report |
| preview.png | Screenshot of the delivered configuration |
| request.json, manifest.json | Archived input and delivery manifest |

The interactive preview loads the same GGB file. It supports applicable point dragging, parameter changes, and zooming, without overwriting the delivered file. For manual calls or integration with other local tools:

```sh
node <installed-plugin>/dist/src/cli.js doctor
node <installed-plugin>/dist/src/cli.js inspect --ggb /absolute/base.ggb
node <installed-plugin>/dist/src/cli.js build --request /absolute/request.json
node <installed-plugin>/dist/src/cli.js preview --delivery /absolute/delivery
```

Pass `base` in the request to edit an existing GGB's colors, line styles, filling, or visibility. `inspect` lists the objects and the digest that the request must declare. Request authoring is documented in the [Skill capability contract](skills/ggb-construction/references/capabilities.md), in Chinese. Use `--headless` for automated preview checks. The caller must keep the preview process running; a one-shot host may terminate it when the host exits.

Press Ctrl+C to end the preview session. Browser selection and tab-close behavior depend on the version. See the [change record](https://github.com/Jack7510/ggb-plugins/blob/main/docs/CHANGES.md) for released behavior and pending changes.

## Repository guide

- `src/`, `viewer/`: local execution, verification, and the viewer.
- `skills/`, `dsh/`: shared Skill and host integration.
- `examples/`, `tests/`: runnable inputs and regression tests.
- `scripts/`: dependency setup, packaging, and coverage tools.
- [Requirements and design](https://github.com/Jack7510/ggb-plugins/blob/main/docs/ggb-plugins-design.md): responsibility boundaries and verification gates.
- [Change record](https://github.com/Jack7510/ggb-plugins/blob/main/docs/CHANGES.md): version history and validation evidence.

The project uses the MIT license. GeoGebra has separate licensing and attribution requirements; see [third-party notices](THIRD_PARTY_NOTICES.md).
