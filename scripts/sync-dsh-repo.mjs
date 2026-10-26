#!/usr/bin/env node
/**
 * @fileoverview Rebuilds the DSH bundle and syncs it into the dedicated
 * root-level distribution repository, adding the source and license pointer.
 * The source repository stays the single origin; this script writes artifacts
 * only and never pushes.
 */
import { execFileSync } from 'node:child_process';
import {
  cp, readFile, readdir, rm, writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(process.argv[2] ?? join(root, '..', 'ggb-plugins-dsh'));
const stage = join(root, 'output', 'dsh-sync');
const SOURCE = 'https://github.com/Jack7510/ggb-plugins';

/** Reads and validates one JSON file. */
async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

/** Fails when the three release manifests disagree. */
async function assertVersions() {
  const files = ['package.json', 'plugin.json', 'dsh/package.json'];
  const versions = new Set();
  for (const file of files) versions.add((await readJson(join(root, file))).version);
  if (versions.size !== 1) {
    throw new Error(`Version mismatch across ${files.join(', ')}`);
  }
}

/** Builds the compiled runtime and the capability manifest. */
function build() {
  execFileSync(process.execPath,
    [join(root, 'node_modules/typescript/bin/tsc')], { cwd: root, stdio: 'inherit' });
  execFileSync(process.execPath,
    [join(root, 'scripts/build-capabilities.mjs')], { cwd: root, stdio: 'inherit' });
}

/** Runs the DSH packaging step and returns the staged package directory. */
function packageDsh() {
  const output = execFileSync(process.execPath,
    [join(root, 'scripts/package-plugin.mjs'), stage, '--target=dsh'],
    { cwd: root, encoding: 'utf8' });
  return JSON.parse(output.trim().split('\n').pop()).pluginDirectory;
}

/** Rejects a target directory that is neither empty nor our distribution. */
async function assertTarget() {
  let names;
  try { names = await readdir(target); } catch { return; }
  if (names.length === 0) return;
  if (!names.includes('package.json')) {
    throw new Error(`Refusing to overwrite ${target}: no package.json`);
  }
  const name = (await readJson(join(target, 'package.json'))).name;
  if (name !== 'ggb-plugins-dsh') {
    throw new Error(`Refusing to overwrite ${target}: package name ${name}`);
  }
}

/** Verifies the staged package before it becomes the distribution root. */
async function assertPackage(directory) {
  const manifest = await readJson(join(directory, 'package.json'));
  if (manifest.name !== 'ggb-plugins-dsh') throw new Error('Unexpected package name');
  if (manifest.dsh?.bundle?.patch !== './cordis.patch.yml') {
    throw new Error('Missing dsh.bundle patch');
  }
  if (!manifest.license || !manifest.repository?.url) {
    throw new Error('Missing license or repository metadata');
  }
  return manifest;
}

/** Notes in the distribution repository where source and issues live. */
function sourceNote(version) {
  return `# Source and license

This repository contains generated build artifacts for the DSH package
\`ggb-plugins-dsh\` ${version}. The source, the MIT license and the issue
tracker live at ${SOURCE} (directory \`dsh/\`).

Do not open pull requests here; the tree is regenerated on each release.
`;
}

/** Copies the staged package over the distribution repository. */
async function sync(manifest) {
  await assertTarget();
  await rm(target, { recursive: true, force: true });
  await cp(manifest.directory, target, { recursive: true });
  await writeFile(join(target, 'SOURCE.md'), sourceNote(manifest.version));
  console.log(`Synced ${manifest.name}@${manifest.version} into ${target}`);
  console.log('Next: git add -A && git commit -m "ggb-plugins-dsh <version>"');
}

async function main() {
  await assertVersions();
  build();
  const directory = packageDsh();
  const manifest = await assertPackage(directory);
  await sync({ ...manifest, directory });
}

await main();
