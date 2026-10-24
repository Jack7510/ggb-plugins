# Third-party notices

The repository's MIT license covers its original code. No code has been copied from `ggb_copilot`.

## GeoGebra

Made with GeoGebra® — https://www.geogebra.org/

The separately downloaded GeoGebra Math Apps Bundle is supplied by GeoGebra. Its versioned source URL and archive SHA-256 are recorded in `runtime.lock.json`. The runtime remains in the ignored `.runtime/` directory and is not redistributed in this Git repository.

GeoGebra installers, runtime resources, documentation, language files, and source code have distinct license terms. The bundle README and `deployggb.js` refer to the GeoGebra Non-Commercial License Agreement. Commercial use requires checking the applicable terms and arranging the necessary permission. This repository's MIT license does not grant rights to GeoGebra assets.

- License and attribution requirements: https://www.geogebra.org/license
- Official self-hosting instructions: https://geogebra.github.io/docs/reference/en/GeoGebra_Apps_Embedding/

The installer verifies the official archive's recorded checksum before extraction. It does not remove or replace copyright notices in the bundle.

## JavaScript dependencies

Dependencies are installed separately with pnpm; retain their bundled license and notice files when distributing them.

| Package | License | Source |
| --- | --- | --- |
| Playwright / playwright-core | Apache-2.0 | https://github.com/microsoft/playwright |
| TypeScript | Apache-2.0 | https://github.com/microsoft/TypeScript |
| @types/node | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
