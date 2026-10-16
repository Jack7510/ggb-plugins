import { chromium, type Browser, type Page } from 'playwright';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root, serve } from './server.js';

export interface GgbAPI {
  evalCommand(command: string): boolean;
  getAllObjectNames(): string[];
  getObjectType(name: string): string;
  isDefined(name: string): boolean;
  isIndependent(name: string): boolean;
  isMoveable(name: string): boolean;
  getXcoord(name: string): number;
  getYcoord(name: string): number;
  getValue(name: string): number;
  getCommandString(name: string, localized: boolean): string;
  getColor(name: string): string;
  getVisible(name: string): boolean;
  getXML(): string;
  setCoords(name: string, x: number, y: number): void;
  setCoordSystem(xmin: number, xmax: number, ymin: number, ymax: number): void;
  setAxesVisible(x: boolean, y: boolean): void;
  setGridVisible(visible: boolean): void;
  setColor(name: string, r: number, g: number, b: number): void;
  setLineThickness(name: string, thickness: number): void;
  setLabelVisible(name: string, visible: boolean): void;
  setMode(mode: number): void;
  getBase64(callback: (base64: string) => void): void;
  setBase64(base64: string, callback: () => void): void;
}

declare global {
  interface Window { ggb: GgbAPI; appletReady: Promise<GgbAPI>; }
}

export async function openBrowser(headed = false) {
  const lock = JSON.parse(await readFile(resolve(root, 'runtime.lock.json'), 'utf8')) as { version: string; sha256: string };
  const installed = JSON.parse(await readFile(resolve(root, '.runtime/runtime.json'), 'utf8')) as typeof lock;
  if (installed.version !== lock.version || installed.sha256 !== lock.sha256) throw new Error('Runtime mismatch; run pnpm setup:runtime');
  const service = await serve();
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless: !headed });
    const context = await browser.newContext({ viewport: { width: 1050, height: 840 } });
    // All browser traffic is local, including GeoGebra resources.
    await context.route('**/*', route => route.request().url().startsWith(service.url + '/') ? route.continue() : route.abort());
    const opened = browser;
    let closing: Promise<void> | undefined;
    const stop = () => {
      process.exitCode = 130;
      void close().catch(error => console.error(error));
    };
    const close = () => closing ??= (async () => {
      process.removeListener('SIGINT', stop);
      process.removeListener('SIGTERM', stop);
      try { await opened.close(); } finally { await service.close(); }
    })();
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    return {
      browser, url: service.url, close,
      async page() {
        const page = await context.newPage();
        page.setDefaultTimeout(30_000);
        await page.goto(service.url);
        await page.waitForFunction(() => typeof window.ggb?.getXML === 'function');
        const version = await runtimeVersion(page);
        if (version !== lock.version) throw new Error(`Unexpected GeoGebra version: ${version}`);
        return page;
      },
    };
  } catch (error) {
    await browser?.close();
    await service.close();
    throw error;
  }
}

export const runtimeVersion = (page: Page) => page.evaluate(() =>
  new DOMParser().parseFromString(window.ggb.getXML(), 'text/xml').documentElement.getAttribute('version'));

export const exportGgb = (page: Page) => page.evaluate(() =>
  new Promise<string>((done, reject) => {
    const timer = setTimeout(() => reject(new Error('GGB export timed out')), 30_000);
    window.ggb.getBase64(data => { clearTimeout(timer); done(data); });
  }));

export async function loadGgb(page: Page, base64: string) {
  await page.evaluate(data => new Promise<void>((done, reject) => {
    const timer = setTimeout(() => reject(new Error('GGB load timed out')), 30_000);
    window.ggb.setBase64(data, () => { clearTimeout(timer); done(); });
  }), base64);
  await page.bringToFront();
  await page.locator('#applet canvas').first().waitFor({ state: 'visible' });
  // Material loading precedes the first painted frame in visible Chromium.
  // A screenshot waits for that frame without introducing a fixed sleep.
  await page.screenshot();
}

export async function snapshot(page: Page) {
  return page.evaluate(() => {
    const api = window.ggb;
    return api.getAllObjectNames().sort().map(name => ({
      name, type: api.getObjectType(name), defined: api.isDefined(name),
      independent: api.isIndependent(name), moveable: api.isMoveable(name),
      command: api.getCommandString(name, false),
      x: api.getObjectType(name) === 'point' ? api.getXcoord(name) : null,
      y: api.getObjectType(name) === 'point' ? api.getYcoord(name) : null,
      value: Number.isFinite(api.getValue(name)) ? api.getValue(name) : null,
      color: api.getColor(name), visible: api.getVisible(name),
    }));
  });
}
export type Snapshot = Awaited<ReturnType<typeof snapshot>>;
