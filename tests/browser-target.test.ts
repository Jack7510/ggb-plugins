/**
 * @fileoverview Validates system-browser resolution shared by the CLI and the
 * installer, including the environment override and the missing-browser error.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BROWSER_ENVIRONMENT, resolveBrowserTarget, type ResolveOptions,
} from '../src/browser-target.js';

const MACOS_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MACOS_EDGE = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';

/** Resolve with only the named paths present. */
const resolveWith = (paths: string[], options: ResolveOptions = {}) => {
  const exists = (candidate: string) => paths.includes(candidate);
  return resolveBrowserTarget({ platform: 'darwin', env: {}, exists, ...options });
};

test('prefers an installed Chrome, then Edge, then Chromium', () => {
  assert.deepEqual(resolveWith([MACOS_CHROME, MACOS_EDGE]), {
    label: 'Google Chrome', executablePath: MACOS_CHROME,
  });
  assert.deepEqual(resolveWith([MACOS_EDGE]), {
    label: 'Microsoft Edge', executablePath: MACOS_EDGE,
  });
  assert.deepEqual(resolveWith(['/Applications/Chromium.app/Contents/MacOS/Chromium']), {
    label: 'Chromium', executablePath: '/Applications/Chromium.app/Contents/MacOS/Chromium',
  });
});

test('honours an explicit channel or absolute path', () => {
  assert.deepEqual(resolveWith([], { env: { [BROWSER_ENVIRONMENT]: 'chrome' } }), {
    channel: 'chrome', label: 'chrome',
  });
  assert.deepEqual(resolveWith([], { env: { [BROWSER_ENVIRONMENT]: 'msedge' } }), {
    channel: 'msedge', label: 'msedge',
  });
  const custom = '/opt/chromium/chrome';
  assert.deepEqual(resolveWith([custom], { env: { [BROWSER_ENVIRONMENT]: custom } }), {
    label: 'chrome', executablePath: custom,
  });
});

test('rejects unusable overrides and a machine without a Chromium browser', () => {
  assert.throws(
    () => resolveWith([], { env: { [BROWSER_ENVIRONMENT]: 'relative/path' } }),
    /must be chrome, msedge, or an absolute path/,
  );
  assert.throws(
    () => resolveWith([], { env: { [BROWSER_ENVIRONMENT]: '/missing/chrome' } }),
    /points at a missing file/,
  );
  assert.throws(() => resolveWith([]), /No Chromium-based browser found/);
});

test('resolves the host process without downloading a browser', () => {
  const target = resolveBrowserTarget();
  assert.ok(target.channel !== undefined || target.executablePath !== undefined);
  assert.ok(target.label.length > 0);
});
