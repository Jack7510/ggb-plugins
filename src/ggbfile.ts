/**
 * @fileoverview Reads a user GGB archive and audits it before any applet load.
 *
 * The ZIP reader keeps the plugin free of external tools (unzip, 7z) on every
 * host. The static audit is a prefilter only: GeoGebra stays the authority on
 * whether the document parses, and build re-audits the loaded objects.
 */
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import { limits, ToolError } from './schema.js';

const maxEntries = 32;
const maxEntryBytes = 16 * 1024 * 1024;
const maxTotalBytes = 32 * 1024 * 1024;
const javascriptStub = 'functionggbOnInit(){}';
const allowedEntries = new Set([
  'geogebra.xml', 'geogebra_defaults2d.xml', 'geogebra_defaults3d.xml',
  'geogebra_javascript.js', 'geogebra_thumbnail.png',
]);
// Materials the tool cannot describe, preserve or verify. Rejecting them keeps
// the preservation gate meaningful instead of silently dropping unknown state.
export const opaqueTypes: ReadonlySet<string> = new Set([
  'image', 'button', 'textfield', 'checkbox', 'inputbox', 'audio', 'video',
  '3d', 'plane', 'quadric', 'surface', 'polyhedron', 'prism', 'pyramid',
  'cylinder', 'cone', 'sphere',
]);

export interface GgbArchive {
  bytes: Buffer;
  sha256: string;
  entries: Map<string, Buffer>;
}
export interface GgbObject { name: string; type: string; }
export interface GgbSummary {
  version: string; objects: GgbObject[]; entries: string[];
  view: { xZero: number; yZero: number; scale: number } | null;
}

function findEnd(data: Buffer): number {
  const lowest = Math.max(0, data.length - 0xffff - 22);
  for (let at = data.length - 22; at >= lowest; at--) {
    if (data.readUInt32LE(at) === 0x06054b50) return at;
  }
  throw new ToolError('base_unsupported',
    'Not a GGB ZIP archive (missing central directory)');
}

/** Rejects opaque materials, including every dimensional XML type. */
export function unsupportedType(type: string): boolean {
  return opaqueTypes.has(type) || /3d/i.test(type);
}

/** Bounds allocation using both the declared size and remaining budget. */
function expandEntry(body: Buffer, method: number, size: number,
  remaining: number): Buffer {
  const maximum = Math.min(maxEntryBytes, remaining);
  if (size > maximum || (method === 0 && body.length > maximum)) {
    throw new ToolError('limit_exceeded', 'GGB archive expands too far');
  }
  if (method === 0) return Buffer.from(body);
  if (method !== 8) {
    throw new ToolError('base_unsupported', 'Unsupported GGB compression');
  }
  try {
    return inflateRawSync(body, {
      maxOutputLength: Math.max(1, Math.min(size, maximum)),
    });
  } catch (error) {
    if (error instanceof Error && 'code' in error
        && error.code === 'ERR_BUFFER_TOO_LARGE') {
      throw new ToolError('limit_exceeded', 'GGB entry expands too far');
    }
    throw new ToolError('base_unsupported', 'Corrupt compressed GGB entry');
  }
}

/** One central-directory record plus its bounded inflated body. */
function readEntry(data: Buffer, at: number, remaining: number) {
  if (at + 46 > data.length || data.readUInt32LE(at) !== 0x02014b50) {
    throw new ToolError('base_unsupported', 'Invalid GGB central directory');
  }
  const method = data.readUInt16LE(at + 10);
  const compressed = data.readUInt32LE(at + 20);
  const size = data.readUInt32LE(at + 24);
  const nameLength = data.readUInt16LE(at + 28);
  const extraLength = data.readUInt16LE(at + 30);
  const commentLength = data.readUInt16LE(at + 32);
  const header = data.readUInt32LE(at + 42);
  const name = data.toString('utf8', at + 46, at + 46 + nameLength);
  if (size > maxEntryBytes) {
    throw new ToolError('limit_exceeded',
      `GGB entry exceeds the limit: ${name}`);
  }
  if (header + 30 > data.length) {
    throw new ToolError('base_unsupported', `Truncated GGB entry: ${name}`);
  }
  const start = header + 30 + data.readUInt16LE(header + 26) +
    data.readUInt16LE(header + 28);
  const body = data.subarray(start, start + compressed);
  const bytes = expandEntry(body, method, size, remaining);
  if (bytes.length !== size) {
    throw new ToolError('base_unsupported', `Corrupt GGB entry: ${name}`);
  }
  return {
    next: at + 46 + nameLength + extraLength + commentLength,
    name, bytes,
  };
}

function readZipEntries(data: Buffer): Map<string, Buffer> {
  const end = findEnd(data);
  const count = data.readUInt16LE(end + 10);
  const directory = data.readUInt32LE(end + 16);
  if (count > maxEntries) {
    throw new ToolError('limit_exceeded', `Too many GGB entries: ${count}`);
  }
  if (directory + data.readUInt32LE(end + 12) > data.length) {
    throw new ToolError('base_unsupported', 'Truncated GGB archive');
  }
  const entries = new Map<string, Buffer>();
  let at = directory;
  let total = 0;
  for (let index = 0; index < count; index++) {
    const entry = readEntry(data, at, maxTotalBytes - total);
    total += entry.bytes.length;
    if (total > maxTotalBytes) {
      throw new ToolError('limit_exceeded', 'GGB archive expands too far');
    }
    entries.set(entry.name, entry.bytes);
    at = entry.next;
  }
  return entries;
}

/** Bounded read; the digest binds the request to this exact file. */
export async function readGgb(path: string): Promise<GgbArchive> {
  const info = await stat(path).catch(() => {
    throw new ToolError('base_unsupported', `Base GGB not readable: ${path}`);
  });
  if (!info.isFile() || info.size === 0) {
    throw new ToolError('base_unsupported', 'Base GGB is not a nonempty file');
  }
  if (info.size > limits.ggbBytes) {
    throw new ToolError('limit_exceeded', 'Base GGB exceeds the size limit');
  }
  const bytes = await readFile(path);
  if (bytes.subarray(0, 2).toString() !== 'PK') {
    throw new ToolError('base_unsupported',
      'Base file is not a GGB ZIP archive');
  }
  return {
    bytes, sha256: createHash('sha256').update(bytes).digest('hex'),
    entries: readZipEntries(bytes),
  };
}

function readXml(entries: Map<string, Buffer>): string {
  for (const name of entries.keys()) {
    if (!allowedEntries.has(name)) {
      throw new ToolError('base_unsupported', `Unsupported GGB entry: ${name}`);
    }
  }
  const script = (entries.get('geogebra_javascript.js') ?? Buffer.alloc(0))
    .toString('utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, '');
  // `ggbOnInit` runs automatically; anything beyond the empty stub is code.
  if (script && script !== javascriptStub) {
    throw new ToolError('base_unsupported', 'GGB scripts are not supported');
  }
  const xml = entries.get('geogebra.xml');
  if (!xml) {
    throw new ToolError('base_unsupported', 'GGB archive has no geogebra.xml');
  }
  const text = xml.toString('utf8');
  if (/<ggbscript/i.test(text)) {
    throw new ToolError('base_unsupported',
      'GGB object scripts are not supported');
  }
  if (/<macro\b/i.test(text)) {
    throw new ToolError('base_unsupported', 'Custom tools are not supported');
  }
  return text;
}

/** XML attribute values arrive entity-escaped in the archive. */
function decode(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code: string) => {
    if (code.startsWith('#')) {
      const point = code[1] === 'x' || code[1] === 'X'
        ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff
        ? String.fromCodePoint(point) : match;
    }
    const named: Record<string, string> = {
      amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
    };
    return named[code.toLowerCase()] ?? match;
  });
}

/** Static prefilter: archive hygiene, scripts, describable objects. */
export function auditGgb(entries: Map<string, Buffer>): GgbSummary {
  const text = readXml(entries);
  const version = /<geogebra\b[^>]*\bversion="([^"]+)"/.exec(text)?.[1] ?? '';
  const objects = [...text.matchAll(
    /<element\s+type="([^"]+)"\s+label="([^"]+)"/g)]
    .map(match => ({
      name: decode(match[2]!), type: decode(match[1]!),
    }));
  for (const object of objects) {
    if (unsupportedType(object.type)) {
      throw new ToolError('base_unsupported',
        `Unsupported base object: ${object.name} (${object.type})`);
    }
  }
  if (!objects.length) {
    throw new ToolError('base_unsupported', 'Base GGB has no objects');
  }
  // The view is recorded, not enforced: export normalizes it to the applet.
  const coordSystem = /<coordSystem\b[^>]*>/.exec(text)?.[0] ?? '';
  const attribute = (name: string) =>
    new RegExp(`\\b${name}="([^"]+)"`).exec(coordSystem)?.[1];
  const view = ['xZero', 'yZero', 'scale'].map(attribute);
  return {
    version, objects, entries: [...entries.keys()],
    view: view.every(value => value !== undefined) ? {
      xZero: Number(view[0]), yZero: Number(view[1]), scale: Number(view[2]),
    } : null,
  };
}
