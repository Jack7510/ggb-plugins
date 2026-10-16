/**
 * DSH bundle: expose the ggb-plugins GeoGebra construction skill to DeepSeek
 * Harness agents.
 *
 * The skill body is not duplicated here. Both clients read the repository's
 * Codex skill bundle, `skills/ggb-construction/SKILL.md`, so one file stays the
 * source of truth. Codex resolves the CLI relative to that file ("two levels
 * up"); a DSH-installed bundle does not keep that layout, so DSH loads a copy
 * with the absolute paths resolved at load time appended at the end.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
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
/** Entries that identify a ggb-plugins directory and its compiled runtime. */
const SKILL_ENTRY = `skills/${SKILL_NAME}/SKILL.md`;
const RUNTIME_ENTRY = 'dist/src/cli.js';
const MANIFEST_ENTRY = 'plugin.json';
/** Codex installs each version into its own directory under this cache. */
const CODEX_CACHE = ['.codex', 'plugins', 'cache', 'ggb-plugins-local', 'ggb-plugins'];
/** How far above this module a checkout may sit. */
const SEARCH_DEPTH = 5;

const INVOCATION = Object.freeze({ modelInvocable: true, userInvocable: true });

const has = (root, entry) => existsSync(join(root, entry));
/** A directory that carries the skill bundle is a valid skill source. */
const isSource = root => has(root, SKILL_ENTRY) && has(root, MANIFEST_ENTRY);
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

/** Nearest ancestor of `from` that looks like a ggb-plugins directory. */
const findCheckout = from => {
  let directory = resolve(from);
  for (let step = 0; step < SEARCH_DEPTH && dirname(directory) !== directory; step += 1) {
    if (isSource(directory)) return directory;
    directory = dirname(directory);
  }
  return undefined;
};

/** Newest Codex-installed copy that still carries the compiled runtime. */
const findInstalledCopy = home => {
  const cache = join(home, ...CODEX_CACHE);
  let versions;
  try {
    versions = readdirSync(cache);
  } catch {
    return undefined;
  }
  const usable = versions.filter(version => isRuntime(join(cache, version)));
  usable.sort((left, right) => left.localeCompare(right, 'en', { numeric: true }));
  const newest = usable.at(-1);
  return newest === undefined ? undefined : join(cache, newest);
};

/**
 * Resolve where the skill body and the compiled CLI come from.
 *
 * Configuration wins over discovery. Discovery prefers a checkout near this
 * module, then the newest Codex-installed copy, so an installed bundle still
 * works when it is copied outside the repository.
 *
 * @param config - row config: optional absolute `skillRoot`, `pluginRoot`, `rank`.
 * @param options - discovery roots; offline tests only.
 * @returns absolute `skillSource` and `pluginRoot`, the latter `undefined` when nothing is built.
 */
const resolveRoots = (config, options = {}) => {
  const home = options.home ?? homedir();
  const from = options.from ?? dirname(fileURLToPath(import.meta.url));
  const absolute = (value, key) => {
    if (value === undefined) return undefined;
    if (!isAbsolute(value)) throw new Error(`${name}: ${key} must be an absolute path, received "${value}"`);
    return value;
  };
  const configuredSource = absolute(config.skillRoot, 'skillRoot');
  const configuredRuntime = absolute(config.pluginRoot, 'pluginRoot');
  const fromEnvironment = process.env.DSH_GGB_PLUGIN_ROOT?.trim() || undefined;
  const checkout = findCheckout(from);
  const installed = findInstalledCopy(home);

  const skillSource = configuredSource ?? [checkout, installed].find(root => root !== undefined && isSource(root));
  if (skillSource === undefined) throw new Error(`${name}: found no ggb-plugins directory; set skillRoot to a checkout or an installed copy`);
  if (!isSource(skillSource)) throw new Error(`${name}: ${skillSource} is not a ggb-plugins directory`);

  const pluginRoot = configuredRuntime ?? fromEnvironment ?? [skillSource, checkout, installed].find(root => root !== undefined && isRuntime(root));
  if (pluginRoot !== undefined && !isRuntime(pluginRoot)) {
    throw new Error(`${name}: ${pluginRoot} has no ${RUNTIME_ENTRY}; build the checkout or run scripts/setup-plugin.mjs there`);
  }
  return { skillSource, pluginRoot };
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
      'DSH 插件没有找到已构建的 GeoGebra CLI，现在还不能作图。请先构建 `<repo>`（`pnpm install --frozen-lockfile && pnpm build`，或执行 `node scripts/setup-plugin.mjs`）后重新加载本技能；也可以在 DSH 插件行配置里把 `pluginRoot` 指向一个已构建的安装副本。不要凭猜测拼接路径执行。',
    ].join('\n');
  }
  const cli = join(pluginRoot, RUNTIME_ENTRY);
  return [
    '## DSH 运行路径（本插件注入）',
    '',
    '以下绝对路径在加载本技能时解析，优先于正文中「向上两级定位 `<plugin>`」的相对说法。所有 GeoGebra 命令都使用这里给出的 node 与 CLI：',
    '',
    '```json',
    JSON.stringify({ ggb: { pluginRoot, node: process.execPath, cli } }, undefined, 2),
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
