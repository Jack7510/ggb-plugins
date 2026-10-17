/**
 * @fileoverview Owns GeoGebra execution and browser resources via Playwright.
 */
import { chromium, type Browser, type Page } from 'playwright';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { root, serve } from './server.js';
import type { EditEffect, UpdateEffect } from './edit.js';
import { limits, ToolError, toolError, type Edit, type Request, type MathValue, type Interaction, type Style, type Update } from './schema.js';

export async function openDefaultBrowser(url: string, signal?: AbortSignal) {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'rundll32.exe' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  await promisify(execFile)(command, args, { signal, timeout: limits.operationMs });
}

export interface GgbAPI {
  evalCommand(command: string): boolean;
  evalCommandGetLabels(command: string): string | null;
  asyncEvalCommandGetLabels(command: string): Promise<string | null>;
  evalCommandCAS(command: string): string;
  getValueString(name: string, localized?: boolean): string;
  deleteObject(name: string): void;
  setPerspective(perspective: string): void;
  setFixed(name: string, fixed: boolean): void;
  getAllObjectNames(): string[];
  getObjectType(name: string): string;
  isDefined(name: string): boolean;
  isIndependent(name: string): boolean;
  isMoveable(name: string): boolean;
  isFixed(name: string): boolean;
  getXcoord(name: string): number;
  getYcoord(name: string): number;
  getValue(name: string): number;
  getCommandString(name: string, localized: boolean): string;
  getColor(name: string): string;
  getVisible(name: string): boolean;
  getLabelVisible(name: string): boolean;
  getLabelStyle(name: string): number;
  getLineThickness(name: string): number;
  getXML(name?: string): string;
  getViewProperties(view: number): string;
  getCaption(name: string, substitute: boolean): string;
  getLineStyle(name: string): number;
  getFilling(name: string): number;
  setFilling(name: string, filling: number): void;
  setCaption(name: string, caption: string): void;
  setLineStyle(name: string, style: number): void;
  setCoords(name: string, x: number, y: number): void;
  setValue(name: string, value: number): void;
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
  interface Window {
    ggb: GgbAPI;
    appletReady: Promise<GgbAPI>;
    setViewerLocale(locale: string, display?: 'graphics' | 'algebra'): void;
  }
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
  const startup = AbortSignal.any([AbortSignal.timeout(limits.operationMs), ...(signal ? [signal] : [])]);
  let browser: Browser | undefined;
  const diagnostics: string[] = [];
  let abortStartup: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => { abortStartup = () => reject(startup.reason); });
  startup.addEventListener('abort', abortStartup, { once: true });
  try {
    startup.throwIfAborted();
    const launch = chromium.launch({
      timeout: limits.operationMs,
      channel: headed ? 'chrome' : undefined,
      headless: !headed, handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false,
    }).then(async opened => {
      // launch has no AbortSignal API. This handler owns any late result even
      // after the caller has stopped waiting; native timeout bounds the launch.
      if (startup.aborted) {
        try { await opened.close(); } catch (cleanup) { diagnostics.push(String(cleanup)); }
        throw startup.reason;
      }
      browser = opened;
      return opened;
    });
    await Promise.race([launch, aborted]);
    const opened = browser!;
    const context = await Promise.race([opened.newContext({ viewport: { width: 1050, height: 840 }, acceptDownloads: false }), aborted]);
    // All browser traffic is local, including GeoGebra resources.
    await Promise.race([context.route('**/*', route => route.request().url().startsWith(service.url + '/') ? route.continue() : route.abort()), aborted]);
    startup.throwIfAborted();
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
      browser: opened, url: service.url, close, publishPreview: service.publishPreview,
      async page() {
        const page = await context.newPage();
        page.setDefaultTimeout(limits.operationMs);
        await page.goto(service.url);
        await page.waitForFunction(() => typeof window.ggb?.getXML === 'function');
        const version = await runtimeVersion(page);
        if (version !== lock.version) throw new Error(`Unexpected GeoGebra version: ${version}`);
        await page.evaluate(timeout => {
          const evaluate = window.ggb.asyncEvalCommandGetLabels.bind(window.ggb);
          // GeoGebra owns lazy module loading. Every native asynchronous call is bounded.
          window.ggb.asyncEvalCommandGetLabels = source => new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Native command timed out')), timeout);
            Promise.resolve().then(() => evaluate(source)).then(resolve, reject).finally(() => clearTimeout(timer));
          });
        }, limits.operationMs);
        return page;
      },
    };
  } catch (error) {
    const failure = toolError(error, 'runtime_unavailable', startup);
    try { await browser?.close(); } catch (cleanup) { diagnostics.push(String(cleanup)); }
    try { await service.close(); } catch (cleanup) { diagnostics.push(String(cleanup)); }
    failure.details = { cause: failure.details, cleanup: diagnostics };
    throw failure;
  } finally { startup.removeEventListener('abort', abortStartup); }
}

export const runtimeVersion = (page: Page) => page.evaluate(() =>
  new DOMParser().parseFromString(window.ggb.getXML(), 'text/xml').documentElement.getAttribute('version'));

export const exportGgb = (page: Page) => page.evaluate(timeout =>
  new Promise<string>((done, reject) => {
    const timer = setTimeout(() => reject(new Error('GGB export timed out')), timeout);
    window.ggb.getBase64(data => { clearTimeout(timer); done(data); });
  }), limits.operationMs);

/** Loads exported bytes, waits for data readiness and updates viewer text. */
export async function loadGgb(
  page: Page, base64: string, prompt?: string,
  display?: 'graphics' | 'algebra',
): Promise<void> {
  await page.evaluate(({ data, timeout }) => new Promise<void>((done, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('GGB load timed out'));
    }, timeout);
    window.ggb.setBase64(data, () => {
      clearTimeout(timer);
      done();
    });
  }), { data: base64, timeout: limits.operationMs });
  if (prompt) {
    await page.locator('h1').evaluate((element, text) => {
      element.textContent = text;
    }, prompt);
  }
  await page.bringToFront();
  await page.waitForFunction(() => {
    return ['#applet canvas', '.algebraView'].some(selector => {
      return [...document.querySelectorAll(selector)].some(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
    });
  });
  // setBase64 completion is the data gate. Mouse interactions wait for painting
  // at their own boundary; the one retained screenshot waits for its own frame.
  await page.evaluate(display => {
    window.setViewerLocale(document.documentElement.lang, display);
  }, display);
}

export async function snapshot(page: Page) {
  const facts = await page.evaluate(() => {
    const api = window.ggb;
    const xml = new DOMParser().parseFromString(api.getXML(), 'text/xml');
    const elements = new Map([...xml.querySelectorAll('construction > element')].map(e => [e.getAttribute('label'), e]));
    const definitions = new Map([...xml.querySelectorAll('construction > command')].flatMap(command =>
      [...(command.querySelector('output')?.attributes ?? [])].map(output => [output.value, {
        name: command.getAttribute('name')!, args: [...(command.querySelector('input')?.attributes ?? [])].map(attribute => attribute.value),
      }] as const)));
    const expressions = new Map([...xml.querySelectorAll('construction > expression')].map(e => [e.getAttribute('label'), e.getAttribute('exp')]));
    const names = api.getAllObjectNames();
    const finite = (n: number) => Number.isFinite(n) ? n : null;
    return names.sort().map(name => {
      const nativeType = api.getObjectType(name);
      const type = ['triangle', 'quadrilateral', 'pentagon', 'hexagon', 'polygon'].includes(nativeType) ? 'polygon' : nativeType;
      const element = elements.get(name);
      const expression = expressions.get(name) ?? '';
      // Canonical function declarations explicitly name their bound variables.
      // Nested commands with local binders remain ambiguous.
      const parameters = /^[A-Za-z][A-Za-z0-9_]*(?:\{[A-Za-z0-9]+\})?\(([^()]*)\)\s*=/.exec(expression)?.[1]?.split(',').map(s => s.trim()) ?? [];
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
        referenceState: (() => {
          const args = definitions.get(name)?.args;
          // Local binders and nested expressions cannot be resolved by token
          // matching alone. Preserve them as evidence, never certify such edges.
          const body = expression.replace(/^[A-Za-z][A-Za-z0-9_]*(?:\{[A-Za-z0-9]+\})?\([^()]*\)\s*=/, '');
          const scopedExpression = !args && ((!api.isIndependent(name) && /function/.test(nativeType) && !parameters.length)
            || /[A-Za-z][A-Za-z0-9_]*\s*[\[(][^\])]*,/.test(body));
          return scopedExpression || args && (new Set(args).size !== args.length || args.some(s => !/^(?:[A-Za-z][A-Za-z0-9_]*(?:\{[A-Za-z0-9]+\})?|-?\d+(?:\.\d+)?(?:E[-+]?\d+)?)$/.test(s))) ? 'ambiguous' : 'direct';
        })(),
        expression: expressions.get(name) ?? null,
        inputs: [...new Set([...(definitions.get(name)?.args ?? []), expression].flatMap(s => s.replace(/"(?:\\.|[^"\\])*"/g, ' ').match(/[A-Za-z][A-Za-z0-9_]*(?:\{[A-Za-z0-9]+\})?/g) ?? []).filter(token => token !== name && !parameters.includes(token) && names.includes(token)))],
        valueString: api.getValueString(name, false),
        x: type === 'point' ? finite(api.getXcoord(name)) : null,
        y: type === 'point' ? finite(api.getYcoord(name)) : null,
        value: finite(api.getValue(name)), line, circle,
        color: api.getColor(name), visible: api.getVisible(name), labelVisible: api.getLabelVisible(name), labelStyle: api.getLabelStyle(name),
        lineThickness: api.getLineThickness(name),
        lineStyle: api.getLineStyle(name),
        filling: finite(api.getFilling(name)),
        caption: api.getCaption(name, false),
        fixed: element?.querySelector('fixed')?.getAttribute('val') === 'true',
        slider: element?.querySelector('slider') ? {
          min: api.getValue(element.querySelector('slider')!.getAttribute('min')!),
          max: api.getValue(element.querySelector('slider')!.getAttribute('max')!),
        } : null,
      };
    });
  });
  const lists = facts.filter(fact => fact.type === 'list').map(fact => fact.name);
  const values = lists.length ? await page.evaluate(nativeValues, lists) : [];
  return facts.map(fact => ({ ...fact, data: fact.type === 'list' ? values[lists.indexOf(fact.name)] ?? null : null }));
}
export type Snapshot = Awaited<ReturnType<typeof snapshot>>;

/** Execute only compiler-produced data, never model-authored JavaScript. */
export async function execute(page: Page, compiled: import('./compile.js').Compiled, prompt: string) {
  if (compiled.program.some(step => step.mode === 'cas')) await waitForCAS(page);
  const expectEmpty = compiled.mode === 'create';
  await page.evaluate(async ({ program, styles, view, prompt, display, native, expectEmpty }) => {
    const api = window.ggb;
    document.querySelector('h1')!.textContent = prompt;
    document.querySelector('h1')!.title = prompt;
    document.title = 'GeoGebra · ' + prompt.slice(0, 60);
    document.querySelector('#status')!.textContent = display === 'algebra' ? '原生代数结果已显示。' : '拖动点或改变滑块观察联动；使用右下角按钮缩放。';
    if (expectEmpty && api.getAllObjectNames().length) throw new Error('Expected an empty canvas');
    if (!expectEmpty && api.getAllObjectNames().length === 0) throw new Error('Expected the declared base');
    if (expectEmpty) api.setPerspective(display === 'algebra' ? 'A' : 'G');
    for (const { step, command, mode, outputs, initial } of program) {
      const before = api.getAllObjectNames();
      if (outputs.some(id => before.includes(id))) throw new Error(`Object name collision: ${step.id}`);
      let source = command;
      if (mode === 'cas') {
        const result = api.evalCommandCAS(command);
        if (!result || result.includes('?') || /undefined|error/i.test(result)) throw new Error(`CAS result unresolved: ${step.id}: ${result}`);
        source = `${step.id}=(${result})`;
      }
      const labels = step.op === 'native' ? (await api.asyncEvalCommandGetLabels(source))?.split(',').filter(Boolean) : null;
      // Execute before probing definedness: a structured step defines its
      // outputs inside evalCommand, so a pre-check reports every output missing.
      const executed = step.op === 'native' ?
        Boolean(labels?.length) : api.evalCommand(source);
      const missing = outputs.filter(id => !api.isDefined(id));
      if (!executed || missing.length > 0) {
        // A created label can still be undefined, for example an intersection
        // that does not exist. Telling those cases apart shortens a repair.
        const state = (id: string) => labels?.includes(id) ?
          `${id} (undefined)` : `${id} (not created)`;
        const detail = `actual labels: ${labels?.join(',') ?? 'none'}`
          + `; missing: ${missing.map(state).join(', ') || 'none'}`;
        throw new Error(
          `Execution failed or output undefined: ${step.id}; ${detail}`);
      }
      if (labels && (labels.length !== outputs.length || labels.some(id => !outputs.includes(id)))) throw new Error(`Incomplete native outputs: ${step.id}: ${labels.join(',')}`);
      if (step.op === 'native' && api.getAllObjectNames().some(id => !before.includes(id) && !outputs.includes(id) && api.isIndependent(id)))
        throw new Error(`Undeclared independent output: ${step.id}`);
      if (initial) {
        if (api.getObjectType(step.id) !== 'point' || !api.isMoveable(step.id)) throw new Error('Initial coordinates require a movable point');
        api.setCoords(step.id, initial[0], initial[1]);
      }
      for (const id of outputs) if (api.getObjectType(id) === 'point') { api.setLabelVisible(id, true); api.setLabelStyle(id, 0); }
      // GeoGebra reloads a text object's default thickness as 5, not 0.
      // Canonicalize at construction; explicit styles below still take precedence.
      for (const id of outputs) if (api.getObjectType(id) === 'text') api.setLineThickness(id, 5);
      const xml = new DOMParser().parseFromString(api.getXML(), 'text/xml');
      if ([...xml.querySelectorAll('element')].some(e => /3d|plane|quadric|surface|image|button|textfield/i.test(e.getAttribute('type') ?? ''))
        || [...xml.querySelectorAll('javascript, ggbscript')].some(e => e.textContent?.trim() || [...e.attributes].some(a => a.value.trim()))) throw new Error('Unsupported spatial, external or scripted material');
    }
    if (expectEmpty) {
      for (const { object, properties: p } of styles) {
        if (p.color !== undefined) api.setColor(object, ...[1, 3, 5].map(i => parseInt(p.color!.slice(i, i + 2), 16)) as [number, number, number]);
        if (p.fixed !== undefined) api.setFixed(object, p.fixed);
        if (p.visible !== undefined) api.setVisible(object, p.visible);
        if (p.labelVisible !== undefined) api.setLabelVisible(object, p.labelVisible);
        if (p.lineThickness !== undefined) api.setLineThickness(object, p.lineThickness);
        if (p.lineStyle !== undefined) api.setLineStyle(object, p.lineStyle);
        if (p.filling !== undefined) api.setFilling(object, p.filling);
        if (p.caption !== undefined) { api.setCaption(object, p.caption); api.setLabelStyle(object, 3); }
      }
      api.setAxesVisible(native, native); api.setGridVisible(false);
      if (view) {
        const size = JSON.parse(api.getViewProperties(1));
        const ratio = size.width / size.height;
        const height = Math.max(view.yMax - view.yMin, (view.xMax - view.xMin) / ratio), width = height * ratio;
        const x = (view.xMin + view.xMax) / 2, y = (view.yMin + view.yMax) / 2;
        api.setCoordSystem(x - width / 2, x + width / 2, y - height / 2, y + height / 2);
      }
      api.setMode(0);
    }
  }, { ...compiled, prompt, expectEmpty });
  if (expectEmpty && !compiled.view && compiled.display === 'graphics') {
    const objects = await snapshot(page);
    const bounds = objects.flatMap(f => f.type === 'point' && f.x !== null && f.y !== null ? [[f.x, f.y]]
      : f.circle ? [[f.circle.x - f.circle.radius, f.circle.y - f.circle.radius], [f.circle.x + f.circle.radius, f.circle.y + f.circle.radius]] : []);
    if (!bounds.length) return;
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

/** Applies declared presentation fields and reports the observed values. */
export async function applyStyles(
  page: Page, styles: { object: string; properties: Style }[],
): Promise<EditEffect[]> {
  return await page.evaluate(styles => {
    const api = window.ggb;
    const read = (name: string, field: string): unknown => {
      if (field === 'color') return api.getColor(name);
      if (field === 'lineThickness') return api.getLineThickness(name);
      if (field === 'lineStyle') return api.getLineStyle(name);
      if (field === 'filling') return api.getFilling(name);
      if (field === 'labelVisible') return api.getLabelVisible(name);
      if (field === 'visible') return api.getVisible(name);
      if (field === 'caption') return api.getCaption(name, false);
      if (field === 'fixed') return api.isFixed(name);
      throw new Error('Unsupported style field: ' + field);
    };
    const write = (name: string, field: string, value: unknown) => {
      if (field === 'color') {
        const hex = String(value).replace('#', '');
        const channels = [0, 2, 4].map(
          offset => parseInt(hex.slice(offset, offset + 2), 16)) as
          [number, number, number];
        api.setColor(name, ...channels);
      } else if (field === 'lineThickness') {
        api.setLineThickness(name, Number(value));
      } else if (field === 'lineStyle') {
        api.setLineStyle(name, Number(value));
      } else if (field === 'filling') {
        api.setFilling(name, Number(value));
      } else if (field === 'labelVisible') {
        api.setLabelVisible(name, Boolean(value));
      } else if (field === 'visible') {
        api.setVisible(name, Boolean(value));
      } else if (field === 'caption') {
        api.setCaption(name, String(value));
        api.setLabelStyle(name, 3);
      } else if (field === 'fixed') {
        api.setFixed(name, Boolean(value));
      } else throw new Error('Unsupported style field: ' + field);
    };
    const effects: EditEffect[] = [];
    for (const { object, properties } of styles) {
      if (!api.getAllObjectNames().includes(object) || !api.isDefined(object)) {
        throw new Error('Style target is missing or undefined: ' + object);
      }
      for (const [field, value] of Object.entries(properties)) {
        const before = read(object, field);
        write(object, field, value);
        effects.push({ object, field, before, after: read(object, field) });
      }
    }
    return effects;
  }, styles);
}

/** Applies presentation edits limited to the edit-mode field set. */
export async function applyEdits(page: Page, edits: Edit[]): Promise<EditEffect[]> {
  return await applyStyles(page, edits);
}

/** Applies declared value or coordinate updates to independent base objects. */
export async function applyUpdates(
  page: Page, updates: Update[],
): Promise<UpdateEffect[]> {
  return await page.evaluate(updates => {
    const api = window.ggb;
    const effects: UpdateEffect[] = [];
    for (const update of updates) {
      const name = update.object;
      if (!api.getAllObjectNames().includes(name) || !api.isDefined(name)) {
        throw new Error('Update target is missing or undefined: ' + name);
      }
      if (!api.isIndependent(name)) {
        throw new Error('Update target is not independent: ' + name);
      }
      if (update.value !== undefined) {
        if (api.getObjectType(name) !== 'numeric') {
          throw new Error('Value update needs a numeric object: ' + name);
        }
        const before = api.getValue(name);
        api.setValue(name, update.value);
        effects.push({
          object: name, field: 'value', before, after: api.getValue(name),
        });
      }
      if (update.coords !== undefined) {
        if (api.getObjectType(name) !== 'point' || !api.isMoveable(name)) {
          throw new Error('Coordinate update needs a movable point: ' + name);
        }
        const before = { x: api.getXcoord(name), y: api.getYcoord(name) };
        api.setCoords(name, update.coords[0], update.coords[1]);
        effects.push({
          object: name, field: 'x',
          before: before.x, after: api.getXcoord(name),
        });
        effects.push({
          object: name, field: 'y',
          before: before.y, after: api.getYcoord(name),
        });
      }
    }
    return effects;
  }, updates);
}

/** Waits for drawing before real mouse input. */
async function waitForPaint(page: Page): Promise<void> {
  await page.evaluate(timeout => new Promise<void>((done, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Drag canvas did not paint'));
    }, timeout);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      clearTimeout(timer);
      done();
    }));
  }), limits.operationMs);
}

async function dragScreen(page: Page, point: string) {
  return await page.evaluate(point => {
    const api = window.ggb;
    if (api.getObjectType(point) !== 'point' || !api.isMoveable(point)) {
      throw new Error(`Expected a movable 2D point: ${point}`);
    }
    const xml = new DOMParser().parseFromString(api.getXML(), 'text/xml');
    const view = xml.querySelector('euclidianView coordSystem');
    const canvas = document.querySelector('#applet canvas');
    const rect = canvas?.getBoundingClientRect();
    if (!view || !rect) throw new Error('Missing graphics view');
    const sx = Number(view.getAttribute('scale'));
    const sy = Number(view.getAttribute('yscale') ?? sx);
    const px = api.getXcoord(point);
    const py = api.getYcoord(point);
    const pinned = new Set([...xml.querySelectorAll('element')]
      .filter(element =>
        element.querySelector('fixed')?.getAttribute('val') === 'true')
      .map(element => element.getAttribute('label')));
    // GeoGebra hits the topmost visible object, so a coincident fixed or
    // dependent point can capture the press instead of the drag target.
    const overlaps = api.getAllObjectNames().filter(name => name !== point &&
      api.getObjectType(name) === 'point' && api.isDefined(name) &&
      api.getVisible(name) &&
      Math.hypot((api.getXcoord(name) - px) * sx,
        (api.getYcoord(name) - py) * sy) <= 10)
      .map(name => ({
        name,
        moveable: api.isMoveable(name),
        fixed: pinned.has(name),
      }));
    return {
      x: rect.x + Number(view.getAttribute('xZero')) + px * sx,
      y: rect.y + Number(view.getAttribute('yZero')) - py * sy,
      px, py, rect: rect.toJSON(), overlaps,
    };
  }, point);
}

/** Performs a real mouse drag; ambiguous point hits retain diagnostics. */
export async function dragPoint(
  page: Page, sample: { point: string; dx: number; dy: number },
): Promise<void> {
  await page.bringToFront();
  await waitForPaint(page);
  await page.locator('#applet canvas').first().hover({
    position: { x: 40, y: 40 },
  });
  const screen = await dragScreen(page, sample.point);
  const details = { target: sample.point, sample, screen };
  const movable = screen.overlaps.filter(overlap => overlap.moveable);
  const pinned = screen.overlaps.filter(overlap => overlap.fixed);
  if (movable.length) {
    throw new ToolError('verification_failed',
      'Ambiguous drag target: overlapping movable points', details);
  }
  if (pinned.length) {
    throw new ToolError('verification_failed',
      'Ambiguous drag target: overlapping fixed points', details);
  }
  for (const [x, y] of [[screen.x, screen.y],
    [screen.x + sample.dx, screen.y + sample.dy]]) {
    if (x === undefined || y === undefined || x < screen.rect.x + 8 ||
      x > screen.rect.right - 8 || y < screen.rect.y + 8 ||
      y > screen.rect.bottom - 8) {
      throw new ToolError('verification_failed',
        'Drag sample is outside the view', details);
    }
  }
  await page.mouse.move(screen.x, screen.y);
  await page.mouse.down();
  try {
    await waitForPaint(page);
    await page.mouse.move(
      screen.x + sample.dx, screen.y + sample.dy, { steps: 12 });
    await page.waitForFunction(({ point, px, py }) =>
      Math.hypot(window.ggb.getXcoord(point) - px,
        window.ggb.getYcoord(point) - py) > 1e-8,
    { point: sample.point, px: screen.px, py: screen.py },
    { timeout: limits.operationMs });
  } catch (error) {
    throw new ToolError('verification_failed',
      'Mouse drag did not complete: ' + String(error), details);
  } finally {
    await page.mouse.up();
  }
}

/** Parameter samples exercise the native value setter, not simulated mouse drags. */
export async function interact(page: Page, sample: Interaction) {
  if ('point' in sample) { await dragPoint(page, sample); return 'mouse' as const; }
  await page.evaluate(({ parameter, value }) => {
    const api = window.ggb;
    const xml = new DOMParser().parseFromString(api.getXML(parameter), 'text/xml');
    const slider = xml.querySelector('slider');
    if (api.getObjectType(parameter) !== 'numeric' || !api.isIndependent(parameter) || !api.isMoveable(parameter) || !slider
      || xml.querySelector('fixed')?.getAttribute('val') === 'true')
      throw new Error('Expected an independent movable numeric slider');
    const min = api.getValue(slider.getAttribute('min')!), max = api.getValue(slider.getAttribute('max')!);
    if (![min, max, value].every(Number.isFinite) || value < min || value > max || Math.abs(api.getValue(parameter) - value) <= 1e-8)
      throw new Error('Parameter sample is outside the slider interval or unchanged');
    api.setValue(parameter, value);
    if (Math.abs(api.getValue(parameter) - value) > 1e-8) throw new Error('Parameter did not reach the requested value');
  }, sample);
  return 'native_value' as const;
}

export async function zoom(page: Page) {
  await page.bringToFront();
  const scale = () => page.evaluate(() => Number(new DOMParser().parseFromString(window.ggb.getXML(), 'text/xml').querySelector('euclidianView coordSystem')?.getAttribute('scale')));
  const before = await scale();
  await page.getByRole('button', { name: 'Zoom In', exact: true }).click();
  await page.waitForFunction(before => Number(new DOMParser().parseFromString(window.ggb.getXML(), 'text/xml').querySelector('euclidianView coordSystem')?.getAttribute('scale')) !== before, before);
  return { method: 'button', before, after: await scale() };
}

/** CAS initialization is asynchronous even when evalCommand reports success. */
export async function waitForCAS(page: Page) {
  await page.evaluate(() => window.ggb.evalCommandCAS('1+1'));
  await page.waitForFunction(() => window.ggb.evalCommandCAS('1+1') === '2', {}, { timeout: limits.operationMs });
}

export interface Observation {
  id: string; expression: string; mode: 'algebra' | 'cas'; type: string | null;
  defined: boolean; value: number | null; result: string | null; error?: string;
  data?: MathValue | null; assumptions?: string[];
}

/** Runs in the applet. Read list elements through typed native probes, never formatted strings. */
async function nativeValues(names: string[]): Promise<(MathValue | null)[]> {
  const api = window.ggb, originals = api.getAllObjectNames();
  const xml = originals.map(name => api.getXML(name));
  const created: string[] = [];
  let failure: Error | undefined;
  let nodes = 0;
  const probe = async (expression: string) => {
    const name = `GgbProbeValue${created.length}`; created.push(name);
    if (!await api.asyncEvalCommandGetLabels(`${name}=(${expression})`)) throw new Error('Cannot read native list value');
    return name;
  };
  const read = async (name: string, depth = 0): Promise<MathValue | null> => {
    if (++nodes > 256 || depth > 8) throw new Error('Native value exceeds structural limits');
    if (!api.isDefined(name)) return null;
    const type = api.getObjectType(name), value = api.getValue(name);
    if (type === 'numeric') return Number.isFinite(value) ? value : null;
    if (type === 'boolean') return value === 1 ? true : value === 0 ? false : null;
    if (type !== 'list') return null;
    const size = api.getValue(await probe(`Length(${name})`));
    if (!Number.isInteger(size) || size < 0 || size > 256) throw new Error('Invalid native list length');
    const items: (MathValue | null)[] = [];
    for (let i = 0; i < size; i++) items.push(await read(await probe(`Element(${name},${i + 1})`), depth + 1));
    return items.every(item => item !== null) ? items as MathValue[] : null;
  };
  try {
    const values: (MathValue | null)[] = [];
    for (const name of names) { nodes = 0; values.push(await read(name)); }
    return values;
  } catch (error) { failure = error instanceof Error ? error : new Error(String(error)); throw failure; }
  finally {
    try {
      for (const name of created.reverse()) api.deleteObject(name);
      if (api.getAllObjectNames().length !== originals.length || originals.some((name, i) => api.getXML(name) !== xml[i]))
        throw new Error('Native value collection modified construction objects');
    } catch (cleanup) {
      if (!failure) throw cleanup;
      failure.message += `; Value cleanup failed: ${String(cleanup)}`;
    }
  }
}
/** Probes are temporary native objects. Originals are audited before/after. */
export async function observe(page: Page, request: Request, phase: 'initial' | 'sampled') {
  const durations = { casMs: 0, probesMs: 0, valuesMs: 0, snapshotMs: 0 };
  if (request.plan.display === 'algebra') {
    await page.locator('.algebraPanel').waitFor({ state: 'visible' });
  }
  const checks = request.plan.requirements.flatMap(r => r.checks.flatMap((c, i) =>
    c.kind === 'expression' && (phase === 'initial' || c.scope === 'sampled') ? [{ id: `${r.id}:${i}`, expression: c.expression!, mode: c.mode!, assumptions: c.assumptions ?? [] }] : []));
  if (checks.some(c => c.mode === 'cas')) {
    const start = performance.now(); await waitForCAS(page); durations.casMs = performance.now() - start;
  }
  const originals = await page.evaluate(() => window.ggb.getAllObjectNames().map(name => ({ name, xml: window.ggb.getXML(name) })));
  let observations: Observation[];
  let failure: ReturnType<typeof toolError> | undefined;
  try {
    const probeStart = performance.now();
    observations = await page.evaluate(async checks => {
      const api = window.ggb;
      const originals = api.getAllObjectNames();
      const observations: Observation[] = [];
      for (const [index, check] of checks.entries()) {
        const name = `GgbProbe${index}`;
        let observation: Observation = { ...check, type: null, defined: false, value: null, result: null };
        try {
          const source = check.assumptions.length ? `Assume(${check.assumptions.map(a => `(${a})`).join(' && ')},${check.expression})` : check.expression;
          const result = check.mode === 'cas' ? api.evalCommandCAS(source) : source;
          observation.result = result;
          if (!result || (check.mode === 'cas' && result.includes('?')) || !await api.asyncEvalCommandGetLabels(`${name}=(${result})`)) throw new Error('Native probe did not resolve');
          observation.type = api.getObjectType(name); observation.defined = api.isDefined(name);
          const value = api.getValue(name); observation.value = Number.isFinite(value) ? value : null;
          if (api.getAllObjectNames().some(added => !originals.includes(added) && added !== name && !/^GgbProbe\d+$/.test(added))) throw new Error('Probe introduced undeclared objects');
        } catch (error) { observation.error = String(error); }
        observations.push(observation);
      }
      return observations;
    }, checks);
    durations.probesMs = performance.now() - probeStart;
    const valuesStart = performance.now();
    const values = await page.evaluate(nativeValues, checks.map((_, i) => `GgbProbe${i}`));
    durations.valuesMs = performance.now() - valuesStart;
    observations.forEach((observation, i) => { observation.data = values[i] ?? null; });
  } catch (error) { failure = toolError(error, 'execution_failed'); throw failure; }
  finally {
    try { await page.evaluate(originals => {
      const api = window.ggb;
      for (const name of api.getAllObjectNames()) if (!originals.some(o => o.name === name)) api.deleteObject(name);
      if (api.getAllObjectNames().length !== originals.length || originals.some(o => api.getXML(o.name) !== o.xml)) throw new Error('Verification modified construction objects');
    }, originals); }
    catch (cleanup) {
      if (!failure) throw cleanup;
      failure.details = { cause: failure.details, cleanup: String(cleanup) };
    }
  }
  const snapshotStart = performance.now();
  const objects = await snapshot(page);
  durations.snapshotMs = performance.now() - snapshotStart;
  return { objects, observations, durations };
}
