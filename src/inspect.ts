/**
 * @fileoverview Inspects a user GGB: static archive audit plus live facts.
 *
 * `inspect` is the only way an author learns object names, types and current
 * presentation. `loadBase` is the shared entry used by check and build so both
 * apply the same digest and the same audit.
 */
import { auditGgb, opaqueTypes, readGgb } from './ggbfile.js';
import type { GgbArchive, GgbSummary } from './ggbfile.js';
import { loadGgb, openBrowser, snapshot } from './browser.js';
import { ToolError, toolError } from './schema.js';

const maxObjects = 512;

/** Reads the base once, binds it to the declared digest and audits it. */
export async function loadBase(
  base: { path: string; sha256: string },
): Promise<{ archive: GgbArchive; summary: GgbSummary }> {
  const archive = await readGgb(base.path);
  if (archive.sha256 !== base.sha256) {
    throw new ToolError('base_invalid',
      'Base GGB changed since inspect; run inspect again');
  }
  return { archive, summary: auditGgb(archive.entries) };
}

export interface InspectedObject {
  name: string; type: string; defined: boolean; dependent: boolean;
  moveable: boolean; fixed: boolean; visible: boolean; color: string;
  lineThickness: number; lineStyle: number; filling: number | null;
  labelVisible: boolean; caption: string; definition: string;
}

function describe(facts: Awaited<ReturnType<typeof snapshot>>) {
  return facts.map(fact => ({
    name: fact.name, type: fact.type, defined: fact.defined,
    dependent: !fact.independent, moveable: fact.moveable, fixed: fact.fixed,
    visible: fact.visible, color: fact.color,
    lineThickness: fact.lineThickness, lineStyle: fact.lineStyle,
    filling: fact.filling, labelVisible: fact.labelVisible,
    caption: fact.caption, definition: fact.command,
  }));
}

/** Loads the archive in a fresh applet and reports addressable objects. */
export async function inspectGgb(path: string, signal?: AbortSignal) {
  try {
    const archive = await readGgb(path);
    const summary = auditGgb(archive.entries);
    const session = await openBrowser(false, signal);
    try {
      const page = await session.page();
      await loadGgb(page, archive.bytes.toString('base64'), '',
        'graphics');
      const facts = await snapshot(page);
      if (facts.length > maxObjects) {
        throw new ToolError('limit_exceeded',
          'Base has too many objects to describe');
      }
      const names = new Set(facts.map(fact => fact.name));
      const missing = summary.objects.filter(object =>
        !names.has(object.name));
      if (missing.length) {
        throw new ToolError('base_unsupported',
          'Base objects were dropped on load', missing);
      }
      const opaque = facts.filter(fact => opaqueTypes.has(fact.type));
      if (opaque.length) {
        throw new ToolError('base_unsupported', 'Unsupported base object',
          opaque.map(fact => ({ name: fact.name, type: fact.type })));
      }
      return {
        path, sha256: archive.sha256, bytes: archive.bytes.length,
        version: summary.version, entries: summary.entries,
        view: summary.view, objects: describe(facts),
      };
    } finally {
      await session.close();
    }
  } catch (error) {
    throw toolError(error, 'base_unsupported', signal);
  }
}
