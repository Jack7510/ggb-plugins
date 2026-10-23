/**
 * @fileoverview Serves fixed GeoGebra assets and one in-memory preview on
 * loopback, with origin and filesystem boundaries.
 */
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {compatibleRuntimeAsset} from './runtime-compatibility.js';

/** Installation root, resolved relative to the compiled module. */
export const root = fileURLToPath(new URL('../../', import.meta.url));
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.gif': 'image/gif',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.ogg': 'audio/ogg',
};
interface PreviewMaterial {
  base64: string;
  prompt: string;
  display: string;
  locale?: string;
}
interface PreviewPage {
  url: string;
  loaded: Promise<void>;
  closed: Promise<void>;
}
interface PreviewState {
  origin: string;
  material?: PreviewMaterial;
  ready: () => void;
  finished: () => void;
}
/** Owns the local HTTP listener and the single published preview. */
export interface ResourceService {
  url: string;
  /** Publishes one verified file; locale controls the viewer language. */
  publishPreview(input: PreviewMaterial): PreviewPage;
  /** Stops the HTTP server and closes its remaining connections. */
  close(): Promise<void>;
}

/** Resolves only fixed assets; a symlink escape remains forbidden. */
async function resolveAsset(
  pathname: string, runtime: string, hasPreview: boolean,
): Promise<{ path: string } | { status: 403 | 404 }> {
  if (pathname === '/' || (pathname === '/preview' && hasPreview)) {
    return { path: resolve(root, 'viewer/index.html') };
  }
  if (!pathname.startsWith('/runtime/')) return { status: 404 };
  const path = await realpath(
    resolve(runtime, pathname.slice('/runtime/'.length)),
  );
  return path.startsWith(runtime + sep) ? { path } : { status: 403 };
}

/** Handles the asset and same-origin preview notification routes. */
async function respond(
  req: IncomingMessage, res: ServerResponse,
  runtime: string, state: PreviewState,
): Promise<void> {
  if (req.headers.host !== new URL(state.origin).host ||
      (req.headers.origin && req.headers.origin !== state.origin)) {
    res.writeHead(403).end();
    return;
  }
  if (state.material && req.method === 'POST' &&
      (req.url === '/preview-ready' || req.url === '/preview-close')) {
    if (req.headers.origin !== state.origin) {
      res.writeHead(403).end();
      return;
    }
    res.writeHead(204).end();
    if (req.url === '/preview-ready') state.ready();
    else state.finished();
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  try {
    const pathname = decodeURIComponent(
      new URL(req.url ?? '/', state.origin).pathname,
    );
    const asset = await resolveAsset(pathname, runtime, !!state.material);
    if ('status' in asset) {
      res.writeHead(asset.status).end();
      return;
    }
    let data: Buffer = await readFile(asset.path);
    const enginePrefix = '/runtime/GeoGebra/';
    if (pathname.startsWith(enginePrefix)) {
      data = compatibleRuntimeAsset(pathname.slice(enginePrefix.length), data);
    }
    if (pathname === '/preview') {
      const payload = JSON.stringify(state.material).replaceAll('<', '\\u003c');
      data = Buffer.from(data.toString('utf8').replace('<script src=',
        `<script>window.previewMaterial=${payload};</script><script src=`));
    }
    res.writeHead(200, {
      'Content-Type': mime[extname(asset.path)] ?? 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404).end(); }
}

/** Registers one material and the acknowledgements owned by this service. */
function publishPreview(
  state: PreviewState, material: PreviewMaterial,
): PreviewPage {
  if (state.material) throw new Error('Preview already published');
  state.material = material;
  const loaded = new Promise<void>(done => { state.ready = done; });
  const closed = new Promise<void>(done => { state.finished = done; });
  return { url: state.origin + '/preview', loaded, closed };
}

/** Starts a loopback service; the caller must close it after use. */
export async function serve(
  runtimeDirectory = resolve(root, '.runtime'),
): Promise<ResourceService> {
  const runtime = await realpath(runtimeDirectory);
  const state: PreviewState = {
    origin: '', ready: () => {}, finished: () => {},
  };
  const server = createServer((req, res) => {
    void respond(req, res, runtime, state);
  });
  await new Promise<void>((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', done);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Missing HTTP port');
  }
  state.origin = `http://127.0.0.1:${address.port}`;
  return {
    url: state.origin,
    publishPreview: input => publishPreview(state, input),
    close: () => new Promise<void>((done, reject) => {
      server.close(error => error ? reject(error) : done());
      server.closeAllConnections();
    }),
  };
}
