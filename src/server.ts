import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../../', import.meta.url));
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.gif': 'image/gif', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.ogg': 'audio/ogg',
};

/** Only the viewer and installed runtime are exposed; no output directory is served. */
export async function serve(runtimeDirectory = resolve(root, '.runtime')) {
  const runtime = await realpath(runtimeDirectory);
  let origin = '';
  const server = createServer(async (req, res) => {
    if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin)) {
      res.writeHead(403).end();
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    try {
      const pathname = decodeURIComponent(new URL(req.url!, origin).pathname);
      let file: string;
      if (pathname === '/') file = resolve(root, 'viewer/index.html');
      else if (pathname.startsWith('/runtime/')) {
        file = await realpath(resolve(runtime, pathname.slice('/runtime/'.length)));
        if (!file.startsWith(runtime + sep)) { res.writeHead(403).end(); return; }
      } else { res.writeHead(404).end(); return; }
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', done);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing HTTP port');
  origin = `http://127.0.0.1:${address.port}`;
  return {
    url: origin,
    close: () => new Promise<void>((done, reject) => {
      server.close(error => error ? reject(error) : done());
      server.closeAllConnections();
    }),
  };
}
