/**
 * @fileoverview Emits the machine-readable capability contract shared by every
 * host. The Worker validates this file at boot; the skill text and the manifest
 * therefore cannot drift silently.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const skillPath = join(root, 'skills/ggb-construction/worker.md');
const skill = await readFile(skillPath);
const frontmatter = /^---\r?\nname: [^\r\n]+\r?\nversion: ([^\r\n]+)\r?\n/u.exec(skill.toString('utf8'));
if (!frontmatter) throw new Error('worker.md has no name/version frontmatter');
// The schema is compiled first so the manifest and the runtime share one source.
const { commands, limits, predicates } = await import(
  new URL('../dist/src/schema.js', import.meta.url).href);
const manifest = {
  schemaVersion: 1,
  toolVersion: pkg.version,
  requestProtocolVersion: 2,
  workerProfileVersion: frontmatter[1],
  workerSkillSha256: createHash('sha256').update(skill).digest('hex'),
  modelFacingTools: ['ggb_inspect', 'ggb_check', 'ggb_build'],
  limits,
  commands,
  predicates,
};
const target = join(root, 'capabilities.json');
await writeFile(target, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote ${target}`);
