/** DSH adapter for the shared skill and the runtime shipped beside it. */
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Cordis plugin name. */
const name = 'ggb-plugins-dsh';
/** Service this plugin requires. */
const inject = ['skills'];
/** Skill identity, shared with the Codex plugin. */
const SKILL_NAME = 'ggb-construction';
/** Provider name registered on the skill registry. */
const PROVIDER_NAME = 'ggb-plugins-dsh';
/** Precedence for a source this plugin supplies; below project roots, above user roots. */
const CUSTOM_RANK = 300;
const SKILL_ENTRY = `skills/${SKILL_NAME}/SKILL.md`;
const RUNTIME_ENTRY = 'dist/src/cli.js';

const INVOCATION = Object.freeze({ modelInvocable: true, userInvocable: true });

const has = (root, entry) => existsSync(join(root, entry));
/** A directory that carries the skill bundle is a valid skill source. */
const isSource = root => has(root, SKILL_ENTRY);
/** A directory that carries the compiled CLI is a valid runtime. */
const isRuntime = root => has(root, RUNTIME_ENTRY);

/**
 * Read the skill name and description from YAML frontmatter.
 * @param raw - file contents. @param path - reported in errors.
 * @returns the description and the body without frontmatter.
 */
const parseSkill = (raw, path) => {
  const block = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw);
  if (block?.[1] === undefined) throw new Error(`${name}: ${path} has no YAML frontmatter`);
  const field = key => new RegExp(`^${key}:[ \t]*(.+)$`, 'mu').exec(block[1])?.[1]?.trim();
  const declared = field('name');
  const description = field('description');
  if (declared !== SKILL_NAME) throw new Error(`${name}: ${path} declares skill "${declared}" instead of "${SKILL_NAME}"`);
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
 * @returns Markdown telling the agent which commands to run.
 */
const renderInjection = pluginRoot => {
  if (pluginRoot === undefined) {
    return [
      '## DSH 运行路径（本插件注入）',
      '',
      'DSH 插件没有找到已构建的 GeoGebra CLI，现在还不能作图。请重新安装完整发布包；源码开发时先执行包内 scripts/setup-plugin.mjs。不要从 Codex 缓存或其他 checkout 借用运行时。',
    ].join('\n');
  }
  const cli = join(pluginRoot, RUNTIME_ENTRY);
  return [
    '## DSH 运行路径（本插件注入）',
    '',
    'CLI 的绝对路径在加载本技能时解析，优先于正文中「向上两级定位 `<plugin>`」的相对说法。使用 PATH 中的 Node.js 22+；宿主可能运行在 Electron 中，不把宿主可执行文件当作 node：',
    '',
    '```json',
    JSON.stringify({ ggb: { pluginRoot, node: 'node', cli } }, undefined, 2),
    '```',
  ].join('\n');
};

/**
 * Build the skill provider without registering it.
 * @param config - row config, see {@link resolveRoots}.
 * @param options - discovery roots; offline tests only.
 * @returns the provider, its resolved `pluginRoot`, and the skill candidate.
 */
const createProvider = (config = {}, options = {}) => {
  if (config.rank !== undefined && (typeof config.rank !== 'number' || !Number.isFinite(config.rank))) {
    throw new Error(`${name}: rank must be a finite number`);
  }
  const { skillSource, pluginRoot } = resolveRoots(config, options);
  const skillPath = join(skillSource, SKILL_ENTRY);
  const description = parseSkill(readFileSync(skillPath, 'utf8'), skillPath).description;
  const candidate = {
    name: SKILL_NAME,
    description,
    invocation: { ...INVOCATION },
    provider: PROVIDER_NAME,
    source: PROVIDER_NAME,
    rank: config.rank ?? CUSTOM_RANK,
    resourceBase: { kind: 'directory', path: dirname(skillPath) },
    locator: skillPath,
  };
  const provider = {
    name: PROVIDER_NAME,
    list: () => [candidate],
    async get(_candidate, requestOptions) {
      const raw = await readFile(skillPath, { encoding: 'utf8', signal: requestOptions?.signal });
      const { rank: _rank, locator: _locator, ...summary } = candidate;
      return { ...summary, content: `${parseSkill(raw, skillPath).content}\n\n${renderInjection(pluginRoot)}` };
    },
  };
  return { provider, pluginRoot, candidate };
};

/**
 * Register the GeoGebra construction skill on the profile's skill registry.
 * @param ctx - Cordis context carrying the skill registry.
 * @param config - optional row config, see {@link resolveRoots}.
 */
const apply = (ctx, config = {}) => {
  const { provider, pluginRoot } = createProvider(config);
  if (pluginRoot === undefined) ctx.logger?.warn?.(`${name}: no compiled runtime found; the skill reports how to fix it`);
  // The registry owns this effect through its own context, as the shipped providers rely on.
  ctx.skills.registerProvider(() => provider);
};

export { apply, createProvider, inject, name, parseSkill, renderInjection, resolveRoots };
