import assert from 'node:assert/strict';
import type { Page } from 'playwright';
import { snapshot } from './browser.js';

const tolerance = 1e-8;

/** M1 has one fixed construction; arbitrary commands are not a public input. */
export async function constructTriangle(page: Page) {
  await page.evaluate(() => {
    const api = window.ggb;
    for (const command of [
      'A=(0,0)', 'B=(6,0)', 'C=(2,4)',
      'triangle=Polygon(A,B,C)', 'M=Midpoint(A,B)', 'median=Segment(C,M)',
    ]) {
      if (!api.evalCommand(command)) throw new Error(`Construction failed: ${command}`);
    }
    api.setAxesVisible(false, false);
    api.setGridVisible(false);
    api.setCoordSystem(-2, 8, -2, 6);
    for (const name of ['A', 'B', 'C', 'M']) api.setLabelVisible(name, true);
    api.setColor('median', 215, 72, 48);
    api.setLineThickness('median', 5);
    api.setColor('M', 215, 72, 48);
    api.setMode(0);
  });
}

export async function verifyTriangle(page: Page, initial = true) {
  const objects = await snapshot(page);
  const get = (name: string) => {
    const object = objects.find(object => object.name === name);
    assert(object?.defined, `Object ${name} missing or undefined`);
    return object;
  };
  for (const object of objects) assert(object.defined, `${object.name} is undefined`);
  const [a, b, c, m] = ['A', 'B', 'C', 'M'].map(get);
  assert(a && b && c && m);
  for (const name of ['A', 'B', 'C', 'M', 'triangle', 'a', 'b', 'c', 'median']) {
    assert(get(name).visible, `${name} must be visible`);
  }
  for (const point of [a, b, c, m]) assert(point.labelVisible, `${point.name} label must be visible`);
  for (const name of ['M', 'median']) assert.equal(get(name).color, '#D74830', `${name} color must be red`);
  assert.equal(get('median').lineThickness, 5, 'median line thickness must be 5');
  for (const point of [a, b, c, m]) assert.equal(point.type, 'point');
  for (const point of [a, b, c]) assert(point.independent && point.moveable, `${point.name} must be draggable`);
  assert(!m.independent, 'M must depend on A and B');
  const command = (name: string) => get(name).command.replace(/\s/g, '').replace(/\[/g, '(').replace(/\]/g, ')');
  assert.equal(command('M'), 'Midpoint(A,B)', 'M must be constructed as the midpoint');
  assert.equal(command('median'), 'Segment(C,M)', 'CM must depend on C and M');
  assert.equal(command('triangle'), 'Polygon(A,B,C)');
  assert.equal(get('median').type, 'segment');
  assert.equal(get('triangle').type, 'triangle');
  assert(a.x !== null && a.y !== null && b.x !== null && b.y !== null && c.x !== null && c.y !== null && m.x !== null && m.y !== null);
  assert(Math.abs(m.x - (a.x + b.x) / 2) < tolerance);
  assert(Math.abs(m.y - (a.y + b.y) / 2) < tolerance);
  assert(Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) > tolerance, 'Triangle is degenerate');
  const length = get('median').value;
  assert(length !== null && Math.abs(length - Math.hypot(c.x - m.x, c.y - m.y)) < tolerance);
  if (initial) {
    assert.deepEqual([a.x, a.y, b.x, b.y, c.x, c.y, m.x, m.y], [0, 0, 6, 0, 2, 4, 3, 0]);
  }
  return { status: 'passed' as const, scope: 'fixed triangle and median; not a general theorem', objects };
}

/** Destructive interaction check: callers must provide a disposable reloaded page. */
export async function verifyInteraction(page: Page) {
  await page.bringToFront();
  await page.locator('#applet canvas').first().hover();
  const before = await snapshot(page);
  const point = before.find(object => object.name === 'A');
  assert(point && point.x !== null && point.y !== null);
  const screen = await page.evaluate(() => {
    const xml = new DOMParser().parseFromString(window.ggb.getXML(), 'text/xml');
    const view = xml.querySelector('euclidianView coordSystem');
    const rect = document.querySelector('#applet canvas')?.getBoundingClientRect();
    if (!view || !rect) throw new Error('Missing graphics view');
    const xScale = Number(view.getAttribute('scale'));
    const yScale = Number(view.getAttribute('yscale') ?? xScale);
    return {
      x: rect.x + Number(view.getAttribute('xZero')) + window.ggb.getXcoord('A') * xScale,
      y: rect.y + Number(view.getAttribute('yZero')) - window.ggb.getYcoord('A') * yScale,
    };
  });
  await page.mouse.move(screen.x, screen.y);
  await page.mouse.down();
  try {
    // Let the applet establish the drag target before sending movement.
    await page.evaluate(() => new Promise<void>((done, reject) => {
      const timer = setTimeout(() => reject(new Error('Drag target did not render')), 30_000);
      requestAnimationFrame(() => { clearTimeout(timer); done(); });
    }));
    await page.mouse.move(screen.x + 75, screen.y - 50, { steps: 12 });
    // GeoGebra processes drag updates on animation frames; release after observing one.
    await page.waitForFunction(([x, y]) => Math.hypot(window.ggb.getXcoord('A') - x!, window.ggb.getYcoord('A') - y!) > 0.2, [point.x, point.y]);
  } finally {
    await page.mouse.up();
  }
  const moved = await verifyTriangle(page, false);
  const viewBefore = await page.evaluate(() => {
    const xml = new DOMParser().parseFromString(window.ggb.getXML(), 'text/xml');
    return xml.querySelector('euclidianView coordSystem')?.getAttribute('scale');
  });
  await page.mouse.move(screen.x + 200, screen.y - 100);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -250);
  await page.keyboard.up('Control');
  await page.waitForFunction(scale => {
    const xml = new DOMParser().parseFromString(window.ggb.getXML(), 'text/xml');
    return xml.querySelector('euclidianView coordSystem')?.getAttribute('scale') !== scale;
  }, viewBefore);
  return { status: 'passed' as const, scope: 'one mouse drag and one wheel zoom sample', moved: moved.objects };
}
