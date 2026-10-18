/**
 * @fileoverview Chooses the Chromium-based browser the runtime drives: an
 * installed system Chrome or Edge, or an explicit channel or executable path.
 * Both the CLI and the installer resolve through this module so they agree.
 */
import { existsSync } from 'node:fs';
import { platform as currentPlatform } from 'node:os';
import { basename, isAbsolute } from 'node:path';

/** A browser Playwright can launch, named for doctor and installer output. */
export interface BrowserTarget {
  /** Branded channel Playwright resolves itself. */
  channel?: 'chrome' | 'msedge';
  /** Absolute executable of an installed browser. */
  executablePath?: string;
  /** Human-readable browser name. */
  label: string;
}

/** Environment variable naming a channel or an absolute browser path. */
export const BROWSER_ENVIRONMENT = 'DSH_GGB_BROWSER';

/** Resolution inputs; offline tests override every field. */
export interface ResolveOptions {
  platform?: string;
  env?: NodeJS.ProcessEnv;
  exists?: (path: string) => boolean;
}

/** Windows installation suffixes relative to a Program Files directory. */
const WINDOWS_CHROME = '\\Google\\Chrome\\Application\\chrome.exe';
const WINDOWS_EDGE = '\\Microsoft\\Edge\\Application\\msedge.exe';
/** macOS bundle executables. */
const MACOS_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MACOS_EDGE = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
const MACOS_CHROMIUM = '/Applications/Chromium.app/Contents/MacOS/Chromium';

/** Installed Chromium browsers for the platform, in preference order. */
const installedCandidates = (
  platform: string,
  env: NodeJS.ProcessEnv,
): Array<{ label: string; path: string }> => {
  if (platform === 'win32') {
    const programFiles = env.ProgramFiles ?? env.PROGRAMFILES ?? '';
    const programFilesX86 =
      env['ProgramFiles(x86)'] ?? env['PROGRAMFILES(X86)'] ?? '';
    return [
      { label: 'Google Chrome', path: programFiles + WINDOWS_CHROME },
      { label: 'Microsoft Edge', path: programFilesX86 + WINDOWS_EDGE },
    ];
  }
  if (platform === 'linux') {
    return [
      { label: 'Google Chrome', path: '/usr/bin/google-chrome' },
      { label: 'Chromium', path: '/usr/bin/chromium' },
      { label: 'Microsoft Edge', path: '/usr/bin/microsoft-edge' },
    ];
  }
  return [
    { label: 'Google Chrome', path: MACOS_CHROME },
    { label: 'Microsoft Edge', path: MACOS_EDGE },
    { label: 'Chromium', path: MACOS_CHROMIUM },
  ];
};

/**
 * Resolve the browser to launch.
 * @param options - platform, environment and existence probe; defaults read
 *   the current process.
 * @returns the configured target, or the first installed Chromium browser.
 * @throws when the configured value is invalid or no Chromium browser exists.
 */
export const resolveBrowserTarget = (
  options: ResolveOptions = {},
): BrowserTarget => {
  const env = options.env ?? process.env;
  const exists = options.exists ?? existsSync;
  const configured = env[BROWSER_ENVIRONMENT]?.trim();
  if (configured !== undefined && configured !== '') {
    if (configured === 'chrome' || configured === 'msedge') {
      return { channel: configured, label: configured };
    }
    if (!isAbsolute(configured)) {
      throw new Error(
        `${BROWSER_ENVIRONMENT} must be chrome, msedge, or an absolute path: ` +
          configured,
      );
    }
    if (!exists(configured)) {
      throw new Error(
        `${BROWSER_ENVIRONMENT} points at a missing file: ${configured}`,
      );
    }
    return { executablePath: configured, label: basename(configured) };
  }
  const platform = options.platform ?? currentPlatform();
  const found = installedCandidates(platform, env).find(candidate => {
    return candidate.path !== '' && exists(candidate.path);
  });
  if (found === undefined) {
    throw new Error(
      'No Chromium-based browser found; install Google Chrome or Microsoft ' +
        `Edge, or set ${BROWSER_ENVIRONMENT} to chrome, msedge, or an ` +
        'absolute browser path',
    );
  }
  return { executablePath: found.path, label: found.label };
};

/** The running process's browser target. */
export const browserTarget = (): BrowserTarget => resolveBrowserTarget();
