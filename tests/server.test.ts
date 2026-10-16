import assert from 'node:assert/strict';
import { get } from 'node:http';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { serve } from '../src/server.js';

test('resource server limits requests to the viewer and runtime root', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ggb-server-'));
  await writeFile(join(directory, 'asset.js'), 'window.example = true;');
  await symlink(join(directory, '..'), join(directory, 'outside'));
  const service = await serve(directory);
  try {
    assert.equal((await fetch(service.url)).status, 200);
    const asset = await fetch(service.url + '/runtime/asset.js');
    assert.equal(asset.headers.get('content-type'), 'text/javascript');
    assert.equal(await asset.text(), 'window.example = true;');
    assert.equal((await fetch(service.url + '/result.ggb')).status, 404);
    assert.equal((await fetch(service.url, { method: 'POST' })).status, 405);
    const wrongHost = await new Promise<number | undefined>((done, reject) => {
      get(service.url, { headers: { host: 'example.org' } }, response => {
        response.resume();
        done(response.statusCode);
      }).on('error', reject);
    });
    assert.equal(wrongHost, 403);
    assert.equal((await fetch(service.url, { headers: { origin: 'https://example.org' } })).status, 403);
    assert.equal((await fetch(service.url + '/runtime/%2e%2e%2f')).status, 403);
    assert.equal((await fetch(service.url + '/runtime/outside')).status, 403);
    assert.equal(await (await fetch(service.url, { method: 'HEAD' })).text(), '');
    const preview = service.publishPreview({ base64: 'UEs=', prompt: '</script><script>bad()</script>', display: 'graphics' });
    const html = await (await fetch(preview.url)).text();
    assert(html.includes('window.previewMaterial='));
    assert(!html.includes('</script><script>bad()'));
    assert(!((await (await fetch(service.url)).text()).includes('window.previewMaterial=')));
    assert.equal((await fetch(service.url + '/result.ggb')).status, 404);
    assert.equal((await fetch(service.url + '/preview-close', { method: 'POST' })).status, 403);
    assert.equal((await fetch(service.url + '/preview-ready', { method: 'POST', headers: { origin: service.url } })).status, 204);
    await preview.loaded;
    assert.equal((await fetch(service.url + '/preview-close', { method: 'POST', headers: { origin: service.url } })).status, 204);
    await preview.closed;
    assert.throws(() => service.publishPreview({ base64: '', prompt: '', display: 'graphics' }), /already published/);
  } finally {
    await service.close();
    await rm(directory, { recursive: true, force: true });
  }
  await assert.rejects(fetch(service.url));
});
