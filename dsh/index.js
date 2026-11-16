/** @fileoverview DSH adapter for the shared skills, delivery card and runtime. */
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerDeliveryTool, registerPreviewCommand }
  from './delivery-card.js';

/** Cordis plugin name. */
const name = 'ggb-plugins-dsh';
/** Service this plugin requires. */
const inject = ['skills'];
/** Construction skill identity, shared with the Codex plugin. */
const SKILL_NAME = 'ggb-construction';
/** Setup skill identity, shared with the Codex plugin. */
const SETUP_SKILL_NAME = 'ggb-setup';
/** Provider name registered on the skill registry. */
const PROVIDER_NAME = 'ggb-plugins-dsh';
/** Precedence for a source this plugin supplies; below project roots, above user roots. */
const CUSTOM_RANK = 300;
const SKILLS = [
  {
    name: SKILL_NAME,
    entry: `skills/${SKILL_NAME}/SKILL.md`,
    base: `skills/${SKILL_NAME}`,
  },
  {
    name: SETUP_SKILL_NAME,
    entry: `skills/setup/SKILL.md`,
    base: 'skills/setup',
  },
];
const RUNTIME_ENTRY = 'dist/src/cli.js';

const INVOCATION = Object.freeze({ modelInvocable: true, userInvocable: true });

const has = (root, entry) => existsSync(join(root, entry));
/** A directory that carries the construction skill is a valid skill source. */
const isSource = root => has(root, SKILLS[0].entry);
/** A directory that carries the compiled CLI is a valid runtime. */
const isRuntime = root => has(root, RUNTIME_ENTRY);

/**
 * Read the skill name and description from YAML frontmatter.
 * @param raw - file contents. @param path - reported in errors.
 * @param expected - declared skill name. @returns the description and body.
 */
const parseSkill = (raw, path, expected = SKILL_NAME) => {
  const block = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw);
  if (block?.[1] === undefined) throw new Error(`${name}: ${path} has no YAML frontmatter`);
  const field = key => new RegExp(`^${key}:[ \t]*(.+)$`, 'mu').exec(block[1])?.[1]?.trim();
  const declared = field('name');
  const description = field('description');
  if (declared !== expected) throw new Error(`${name}: ${path} declares skill "${declared}" instead of "${expected}"`);
  if (description === undefined || description.length === 0) throw new Error(`${name}: ${path} has no description`);
  return { description, content: raw.slice(block[0].length).trim() };
};

/** Resolve only this bundle (or an explicit override), never another client's cache. */
const resolveRoots = (config, options = {}) => {
  const from = options.from ?? dirname(fileURLToPath(import.meta.url));
  const absolute = (value, key) => {
    if (value === undefined) return undefined;
    if (!isAbsolute(value)) throw new Error(`${name}: ${key} must be an absolute path`);
    return value;
  };
  const source = absolute(config.skillRoot, 'skillRoot');
  const runtime = absolute(config.pluginRoot, 'pluginRoot');
  if (source && runtime && resolve(source) !== resolve(runtime)) {
    throw new Error(`${name}: skillRoot and pluginRoot must identify the same bundle`);
  }
  const configured = runtime ?? source ?? absolute(process.env.DSH_GGB_PLUGIN_ROOT?.trim() || undefined, 'DSH_GGB_PLUGIN_ROOT');
  // Published bundle: beside index.js. Source checkout: parent of dsh/index.js.
  const skillSource = configured ?? [from, dirname(from)].find(isSource);
  if (!skillSource || !isSource(skillSource)) throw new Error(`${name}: found no ggb-plugins directory beside this bundle; reinstall the complete package`);
  if (runtime && !isRuntime(runtime)) throw new Error(`${name}: ${runtime} has no ${RUNTIME_ENTRY}; run scripts/setup-plugin.mjs there`);
  return { skillSource, pluginRoot: isRuntime(skillSource) ? skillSource : undefined };
};

/**
 * Absolute paths appended to the loaded skill body.
 * @param pluginRoot - resolved runtime, or `undefined` when nothing is built.
 * @param skill - loaded skill name. @returns Markdown for the agent.
 */
const renderInjection = (pluginRoot, skill = SKILL_NAME) => {
  if (pluginRoot === undefined) {
    return [
      '## DSH 运行路径（本插件注入）',
      '',
      'DSH 插件没有找到已构建的 GeoGebra CLI，现在还不能作图。请重新安装完整发布包；源码开发时先执行包内 scripts/setup-plugin.mjs。不要从 Codex 缓存或其他 checkout 借用运行时。',
    ].join('\n');
  }
  const cli = join(pluginRoot, RUNTIME_ENTRY);
  if (skill === SETUP_SKILL_NAME) {
    return [
      '## DSH 安装路径（本插件注入）',
      '',
      `插件根目录：\`${pluginRoot}\``,
      '',
      '使用 PATH 中的 Node.js 22+；宿主可能运行在 Electron 中，不把宿主可执行文件当作 node。',
    ].join('\n');
  }
  return [
    '## DSH 运行路径（本插件注入）',
    '',
    'CLI 的绝对路径在加载本技能时解析，优先于正文中「向上两级定位 `<plugin>`」的相对说法。使用 PATH 中的 Node.js 22+；宿主可能运行在 Electron 中，不把宿主可执行文件当作 node：',
    '',
    '```json',
    JSON.stringify({ ggb: { pluginRoot, node: 'node', cli } }, undefined, 2),
    '```',
    '',
    '构建成功并确认交付目录后，若本宿主提供 `ggb_delivery` 工具，调用一次并传入交付目录，再调用 `present` 声明 GGB、preview.png 和 verification.json；不要为展示重复运行核验。',
  ].join('\n');
};

/**
 * Build the skill provider without registering it.
 * @param config - row config, see {@link resolveRoots}.
 * @param options - discovery roots; offline tests only.
 * @returns the provider, its resolved `pluginRoot`, and the skill candidates.
 */
const createProvider = (config = {}, options = {}) => {
  if (config.rank !== undefined && (typeof config.rank !== 'number' || !Number.isFinite(config.rank))) {
    throw new Error(`${name}: rank must be a finite number`);
  }
  const { skillSource, pluginRoot } = resolveRoots(config, options);
  const available = SKILLS.filter(entry => has(skillSource, entry.entry));
  if (available.length === 0) throw new Error(`${name}: no skill entry found in ${skillSource}`);
  const candidates = available.map(entry => {
    const path = join(skillSource, entry.entry);
    const description = parseSkill(readFileSync(path, 'utf8'), path, entry.name).description;
    return {
      name: entry.name,
      description,
      invocation: { ...INVOCATION },
      provider: PROVIDER_NAME,
      source: PROVIDER_NAME,
      rank: config.rank ?? CUSTOM_RANK,
      resourceBase: { kind: 'directory', path: join(skillSource, entry.base) },
      locator: path,
    };
  });
  const provider = {
    name: PROVIDER_NAME,
    list: () => candidates,
    async get(candidate, requestOptions) {
      const entry = SKILLS.find(item => item.name === candidate.name);
      if (entry === undefined) throw new Error(`${name}: unknown skill "${candidate.name}"`);
      const path = join(skillSource, entry.entry);
      const raw = await readFile(path, { encoding: 'utf8', signal: requestOptions?.signal });
      const { rank: _rank, locator: _locator, ...summary } = candidate;
      const parsed = parseSkill(raw, path, entry.name);
      return { ...summary, content: `${parsed.content}\n\n${renderInjection(pluginRoot, entry.name)}` };
    },
  };
  return { provider, pluginRoot, candidate: candidates[0], candidates };
};

/**
 * Register the GeoGebra skills and, when available, the delivery card.
 * @param ctx - Cordis context carrying the skill registry.
 * @param config - optional row config, see {@link resolveRoots}.
 */
const apply = (ctx, config = {}) => {
  const { provider, pluginRoot } = createProvider(config);
  if (pluginRoot === undefined) ctx.logger?.warn?.(`${name}: no compiled runtime found; the skill reports how to fix it`);
  // The registry owns this effect through its own context, as the shipped providers rely on.
  ctx.skills.registerProvider(() => provider);
  if (pluginRoot !== undefined) {
    const register = child => {
      registerDeliveryTool(child, pluginRoot);
      registerPreviewCommand(child, pluginRoot);
    };
    // Wait for the Host services instead of silently skipping registration.
    if (typeof ctx.inject === 'function') {
      ctx.inject(['tools', 'commands', 'attachments', 'workingDirectory'],
        register);
    } else register(ctx);
  }
};

export { apply, createProvider, inject, name, parseSkill, renderInjection, resolveRoots };
