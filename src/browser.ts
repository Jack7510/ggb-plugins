import { chromium, type Browser, type Page } from 'playwright';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root, serve } from './server.js';
import { limits, toolError } from './schema.js';

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
  getLabelVisible(name: string): boolean;
  getLabelStyle(name: string): number;
  getLineThickness(name: string): number;
  getXML(): string;
  getViewProperties(view: number): string;
  getCaption(name: string, substitute: boolean): string;
  getLineStyle(name: string): number;
  setCaption(name: string, caption: string): void;
  setLineStyle(name: string, style: number): void;
  setCoords(name: string, x: number, y: number): void;
  setCoordSystem(xmin: number, xmax: number, ymin: number, ymax: number): void;
  setAxesVisible(x: boolean, y: boolean): void;
  setGridVisible(visible: boolean): void;
  setColor(name: string, r: number, g: number, b: number): void;
  setVisible(name: string, visible: boolean): void;
  setLineThickness(name: string, thickness: number): void;
  setLabelVisible(name: string, visible: boolean): void;
  setLabelStyle(name: string, style: number): void;
  setMode(mode: number): void;
  getBase64(callback: (base64: string) => void): void;
  setBase64(base64: string, callback: () => void): void;
}

declare global {
  interface Window { ggb: GgbAPI; appletReady: Promise<GgbAPI>; }
}

export async function openBrowser(headed = false, signal?: AbortSignal) {
  try { return await launchBrowser(headed, signal); }
  catch (error) { throw toolError(error, 'runtime_unavailable', signal); }
}

async function launchBrowser(headed: boolean, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const lock = JSON.parse(await readFile(resolve(root, 'runtime.lock.json'), 'utf8')) as { version: string; sha256: string };
  const installed = JSON.parse(await readFile(resolve(root, '.runtime/runtime.json'), 'utf8')) as typeof lock;
  if (installed.version !== lock.version || installed.sha256 !== lock.sha256) throw new Error('Runtime mismatch; run pnpm setup:runtime');
  const service = await serve();
  let browser: Browser | undefined;
  try {
    signal?.throwIfAborted();
    browser = await chromium.launch({
      headless: !headed, handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false,
    });
    signal?.throwIfAborted();
    const context = await browser.newContext({ viewport: { width: 1050, height: 840 } });
    // All browser traffic is local, including GeoGebra resources.
    await context.route('**/*', route => route.request().url().startsWith(service.url + '/') ? route.continue() : route.abort());
    const opened = browser;
    let closing: Promise<void> | undefined;
    // The caller owns cancellation and diagnostics; finally blocks await this same close.
    const stop = () => { void close().catch(() => {}); };
    const close = () => closing ??= (async () => {
      signal?.removeEventListener('abort', stop);
      try { await opened.close(); } finally { await service.close(); }
    })();
    signal?.throwIfAborted();
    signal?.addEventListener('abort', stop, { once: true });
    return {
      browser, url: service.url, close,
      async page() {
        const page = await context.newPage();
        page.setDefaultTimeout(limits.operationMs);
        await page.goto(service.url);
        await page.waitForFunction(() => typeof window.ggb?.getXML === 'function');
        const version = await runtimeVersion(page);
        if (version !== lock.version) throw new Error(`Unexpected GeoGebra version: ${version}`);
        return page;
      },
    };
  } catch (error) {
    const failure = toolError(error, 'runtime_unavailable', signal);
    const diagnostics: string[] = [];
    try { await browser?.close(); } catch (cleanup) { diagnostics.push(String(cleanup)); }
    try { await service.close(); } catch (cleanup) { diagnostics.push(String(cleanup)); }
    if (diagnostics.length) failure.details = { cause: failure.details, cleanup: diagnostics };
    throw failure;
  }
}

export const runtimeVersion = (page: Page) => page.evaluate(() =>
  new DOMParser().parseFromString(window.ggb.getXML(), 'text/xml').documentElement.getAttribute('version'));

export const exportGgb = (page: Page) => page.evaluate(timeout =>
  new Promise<string>((done, reject) => {
    const timer = setTimeout(() => reject(new Error('GGB export timed out')), timeout);
    window.ggb.getBase64(data => { clearTimeout(timer); done(data); });
  }), limits.operationMs);

export async function loadGgb(page: Page, base64: string, prompt?: string) {
  await page.evaluate(({ data, timeout }) => new Promise<void>((done, reject) => {
    const timer = setTimeout(() => reject(new Error('GGB load timed out')), timeout);
    window.ggb.setBase64(data, () => { clearTimeout(timer); done(); });
  }), { data: base64, timeout: limits.operationMs });
  if (prompt) await page.locator('h1').evaluate((element, text) => { element.textContent = text; }, prompt);
  await page.bringToFront();
  await page.locator('#applet canvas').first().waitFor({ state: 'visible' });
  // Material loading precedes the first painted frame in visible Chromium.
  // A screenshot waits for that frame without introducing a fixed sleep.
  await page.screenshot();
}

export async function snapshot(page: Page) {
  return page.evaluate(() => {
    const api = window.ggb;
    const xml = new DOMParser().parseFromString(api.getXML(), 'text/xml');
    const elements = new Map([...xml.querySelectorAll('construction > element')].map(e => [e.getAttribute('label'), e]));
    const definitions = new Map([...xml.querySelectorAll('construction > command')].map(command => [command.querySelector('output')?.getAttribute('a0'), {
      name: command.getAttribute('name')!, args: [...(command.querySelector('input')?.attributes ?? [])].map(attribute => attribute.value),
    }]));
    const finite = (n: number) => Number.isFinite(n) ? n : null;
    return api.getAllObjectNames().sort().map(name => {
      const nativeType = api.getObjectType(name);
      const type = ['triangle', 'quadrilateral', 'pentagon', 'hexagon', 'polygon'].includes(nativeType) ? 'polygon' : nativeType;
      const element = elements.get(name);
      const c = element?.querySelector('coords');
      const m = element?.querySelector('matrix');
      const coefficients = type === 'line' && c ? ['x', 'y', 'z'].map(k => Number(c.getAttribute(k))) : null;
      const norm = coefficients ? Math.hypot(coefficients[0]!, coefficients[1]!) * (coefficients[0] === 0 ? Math.sign(coefficients[1]!) : Math.sign(coefficients[0]!)) : 0;
      const line = coefficients && norm ? coefficients.map(n => finite(n / norm)) : null;
      let circle: { x: number; y: number; radius: number } | null = null;
      if (type === 'circle' && m) {
        const a = Array.from({ length: 6 }, (_, i) => Number(m.getAttribute('A' + i)));
        const x = -a[4]! / a[0]!, y = -a[5]! / a[1]!;
        const radius = api.getValue(`Radius(${name})`);
        if ([x, y, radius].every(Number.isFinite)) circle = { x, y, radius };
      }
      return {
        name, type, nativeType, defined: api.isDefined(name), independent: api.isIndependent(name), moveable: api.isMoveable(name),
        command: api.getCommandString(name, false),
        nativeDefinition: definitions.get(name) ?? null,
        x: type === 'point' ? finite(api.getXcoord(name)) : null,
        y: type === 'point' ? finite(api.getYcoord(name)) : null,
        value: finite(api.getValue(name)), line, circle,
        color: api.getColor(name), visible: api.getVisible(name), labelVisible: api.getLabelVisible(name), labelStyle: api.getLabelStyle(name),
        lineThickness: ['segment', 'line', 'circle', 'polygon'].includes(type) ? api.getLineThickness(name) : null,
        lineStyle: ['segment', 'line', 'circle', 'polygon'].includes(type) ? api.getLineStyle(name) : null,
        caption: api.getCaption(name, false),
      };
    });
  });
}
export type Snapshot = Awaited<ReturnType<typeof snapshot>>;

/** Execute only compiler-produced data, never model-authored JavaScript. */
export async function execute(page: Page, compiled: import('./compile.js').Compiled, prompt: string) {
  await page.evaluate(({ program, styles, view, prompt }) => {
    const api = window.ggb;
    document.querySelector('h1')!.textContent = prompt;
    document.querySelector('h1')!.title = prompt;
    document.title = 'GeoGebra · ' + prompt.slice(0, 60);
    if (api.getAllObjectNames().length) throw new Error('Expected an empty canvas');
    for (const { step, command } of program) {
      if (api.getAllObjectNames().includes(step.id)) throw new Error(`Object name collision: ${step.id}`);
      if (!api.evalCommand(command) || !api.isDefined(step.id)) throw new Error(`Execution failed: ${step.id}`);
      if (api.getObjectType(step.id) === 'point') { api.setLabelVisible(step.id, true); api.setLabelStyle(step.id, 0); }
    }
    for (const { object, properties: p } of styles) {
      if (p.color !== undefined) api.setColor(object, ...[1, 3, 5].map(i => parseInt(p.color!.slice(i, i + 2), 16)) as [number, number, number]);
      if (p.visible !== undefined) api.setVisible(object, p.visible);
      if (p.labelVisible !== undefined) api.setLabelVisible(object, p.labelVisible);
      if (p.lineThickness !== undefined) api.setLineThickness(object, p.lineThickness);
      if (p.lineStyle !== undefined) api.setLineStyle(object, p.lineStyle);
      if (p.caption !== undefined) { api.setCaption(object, p.caption); api.setLabelStyle(object, 3); }
    }
    api.setAxesVisible(false, false); api.setGridVisible(false);
    if (view) api.setCoordSystem(view.xMin, view.xMax, view.yMin, view.yMax);
    api.setMode(0);
  }, { ...compiled, prompt });
  if (!compiled.view) {
    const objects = await snapshot(page);
    const bounds = objects.flatMap(f => f.type === 'point' && f.x !== null && f.y !== null ? [[f.x, f.y]]
      : f.circle ? [[f.circle.x - f.circle.radius, f.circle.y - f.circle.radius], [f.circle.x + f.circle.radius, f.circle.y + f.circle.radius]] : []);
    const xs = bounds.map(p => p[0]!), ys = bounds.map(p => p[1]!);
    const box = { xMin: Math.min(...xs), xMax: Math.max(...xs), yMin: Math.min(...ys), yMax: Math.max(...ys) };
    await page.evaluate(box => {
      const view = JSON.parse(window.ggb.getViewProperties(1));
      const ratio = view.width / view.height;
      const height = Math.max(4, box.yMax - box.yMin, (box.xMax - box.xMin) / ratio) * 1.5;
      const width = height * ratio, x = (box.xMin + box.xMax) / 2, y = (box.yMin + box.yMax) / 2;
      window.ggb.setCoordSystem(x - width / 2, x + width / 2, y - height / 2, y + height / 2);
    }, box);
  }
}

export async function dragPoint(page: Page, sample: { point: string; dx: number; dy: number }) {
  await page.bringToFront();
  await page.locator('#applet canvas').first().hover({ position: { x: 40, y: 40 } });
  const screen = await page.evaluate(point => {
    const api = window.ggb;
    if (!api.isMoveable(point)) throw new Error(`Point is not draggable: ${point}`);
    const xml = new DOMParser().parseFromString(api.getXML(), 'text/xml');
    const view = xml.querySelector('euclidianView coordSystem');
    const rect = document.querySelector('#applet canvas')?.getBoundingClientRect();
    if (!view || !rect) throw new Error('Missing graphics view');
    const xScale = Number(view.getAttribute('scale'));
    const yScale = Number(view.getAttribute('yscale') ?? xScale);
    return { x: rect.x + Number(view.getAttribute('xZero')) + api.getXcoord(point) * xScale,
      y: rect.y + Number(view.getAttribute('yZero')) - api.getYcoord(point) * yScale,
      px: api.getXcoord(point), py: api.getYcoord(point), rect: rect.toJSON() };
  }, sample.point);
  for (const [x, y] of [[screen.x, screen.y], [screen.x + sample.dx, screen.y + sample.dy]]) {
    if (x! < screen.rect.x + 8 || x! > screen.rect.right - 8 || y! < screen.rect.y + 8 || y! > screen.rect.bottom - 8) throw new Error('Drag sample is outside the view');
  }
  await page.mouse.move(screen.x, screen.y); await page.mouse.down();
  try {
    await page.evaluate(() => new Promise<void>((done, reject) => {
      const timer = setTimeout(() => reject(new Error('Drag target did not render')), 30_000);
      requestAnimationFrame(() => { clearTimeout(timer); done(); });
    }));
    await page.mouse.move(screen.x + sample.dx, screen.y + sample.dy, { steps: 12 });
    await page.waitForFunction(({ point, px, py }) => Math.hypot(window.ggb.getXcoord(point) - px, window.ggb.getYcoord(point) - py) > 1e-8, { point: sample.point, px: screen.px, py: screen.py });
  } finally { await page.mouse.up(); }
}

export async function zoom(page: Page) {
  await page.bringToFront();
  const scale = () => page.evaluate(() => Number(new DOMParser().parseFromString(window.ggb.getXML(), 'text/xml').querySelector('euclidianView coordSystem')?.getAttribute('scale')));
  const before = await scale();
  await page.getByRole('button', { name: 'Zoom In', exact: true }).click();
  await page.waitForFunction(before => Number(new DOMParser().parseFromString(window.ggb.getXML(), 'text/xml').querySelector('euclidianView coordSystem')?.getAttribute('scale')) !== before, before);
  return { method: 'button', before, after: await scale() };
}
