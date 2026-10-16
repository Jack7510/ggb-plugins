# DSH 插件：GeoGebra 构图

本目录是给 DeepSeek Harness（DSH）用的 bundle。它把仓库里**同一份** `skills/ggb-construction/SKILL.md` 注册成 DSH 技能，并在加载时把解析出的 GeoGebra CLI 绝对路径追加到技能正文末尾。Codex 侧的 [plugin.json](../plugin.json)、[marketplace](../.agents/plugins/marketplace.json) 和 `skills/` 都不改动：两个客户端共用一份技能文本和一套 CLI。

## 组成

| 文件 | 作用 |
|---|---|
| [package.json](package.json) | bundle 清单，`dsh.bundle.patch` 指向补丁 |
| [cordis.patch.yml](cordis.patch.yml) | 向 profile 插入 `ggb-plugins-dsh` 行 |
| [index.js](index.js) | Cordis Host 插件：解析路径、注册技能提供方 |
| [locale/en.json](locale/en.json)、[locale/zh.json](locale/zh.json) | 插件卡片文案 |
| [test/plugin.test.mjs](test/plugin.test.mjs) | 离线测试（桩注册表，不需要 DSH） |

## 安装

装进**当前实际启动的那个 profile**（用 `echo $DSH_PROFILE` 确认；打包版桌面应用是 `desktop`）。标准路径是用 DSH 自带的插件管理器：

```
plugin_manager  action: install_bundle   target: <repo>/dsh
```

桌面应用**独占管理** `desktop` profile：`dsh --profile desktop --dump-config` 会直接拒绝（`profile "desktop" is managed exclusively by the Electron application`），所以在那里只能用 `plugin_manager`；`dsh plugin --profile <name> add` 只适用于自己启动的 profile。

没有 `plugin_manager` 时，手工等价物是三样，缺一不可：

1. profile 的 `package.json` 里加依赖：`"@local/ggb-plugins-dsh": "link:<repo>/dsh"`；
2. 把 `"@local/ggb-plugins-dsh"` 加进同一个 `package.json` 的 `dsh.profile.bundles`；
3. 让包能从 profile 解析：`<profile>/node_modules/@local/ggb-plugins-dsh` → `<repo>/dsh`（`dsh plugin` 装的话它自己会建）。

**不要用手写补丁行代替安装**：补丁里匹配不到已有 id 的非 `insert` 行会被警告并跳过，而行的 `name` 只有在「随包插件」或「已登记的 bundle」中才解析得到——未登记的包名挂不上，只会静默失败。

**生效时机（实测）**：bundle 列表只在 profile **启动时**读取，所以新增 bundle 需要重启 DSH（或由 `plugin_manager` 应用并回报 `application`）；补丁层相反，改动**热生效**（把随包的 `skill-badge` 行打开，`dsh-badge` 技能立即出现，还原后立即消失）。装好后在**新会话**的技能列表里应出现 `ggb-construction`。

## 为什么不需要配置

`index.js` 按固定顺序解析路径，配置项全部可省略：

| 顺序 | 来源 |
|---|---|
| 1 | 行配置 `skillRoot` / `pluginRoot`（必须是绝对路径） |
| 2 | 环境变量 `DSH_GGB_PLUGIN_ROOT`（运行时） |
| 3 | 从本模块向上最多 5 层，找同时含 `plugin.json` 与 `skills/ggb-construction/SKILL.md` 的目录 |
| 4 | `~/.codex/plugins/cache/ggb-plugins-local/ggb-plugins/<版本>`，取版本号最大的已构建副本 |

技能正文优先取源码 checkout（文字最新），运行时优先取同一目录下的 `dist/src/cli.js`。**找不到已构建运行时时技能仍会注册**，但注入段会写明必须先构建或配置 `pluginRoot`，不会让模型猜路径。

| 字段 | 默认 | 说明 |
|---|---|---|
| `skillRoot` | 自动 | 提供技能正文的 ggb-plugins 目录 |
| `pluginRoot` | 自动 | 含 `dist/src/cli.js` 的已构建副本 |
| `rank` | 300 | 同名技能优先级，数字越小越优先；项目根 100/200、运行时 250、自定义 300、用户根 400/500、随包 600 |

注意：任何 `.dsh/skills/ggb-construction` 或 `.agents/skills/ggb-construction` 副本的 rank 是 100/200，会**优先于**本 bundle（300）。要让本插件的注入路径生效，不要另外放文件系统副本。

## 验证

```sh
# 1) 插件本体：离线测试（桩注册表，不需要 DSH）
node --test dsh/test/plugin.test.mjs

# 2) 宿主能否解析到包（与启动时的解析动作一致）
PROFILE_DIR="${DSH_PROFILE_DIR:-$HOME/.dsh/profiles/web}"
node -e "const {createRequire}=require('node:module');console.log(createRequire(process.argv[1]).resolve('@local/ggb-plugins-dsh'))" "$PROFILE_DIR/package.json"

# 3) 冷加载：确认它注册的技能与注入的绝对路径，不必等重启
node --input-type=module -e '
import { createRequire } from "node:module";
const entry = createRequire(process.argv[1]).resolve("@local/ggb-plugins-dsh");
const plugin = await import(entry);
const providers = [];
plugin.apply({ logger: { warn: console.warn }, skills: { registerProvider: c => providers.push(c({ invalidate(){}, signal: undefined })) } }, {});
const [skill] = await providers[0].list();
const loaded = await providers[0].get(skill, {});
console.log(skill.name, "| rank", skill.rank, "|", JSON.parse(loaded.content.split("```json")[1].split("```")[0]).ggb.cli);
' "$PROFILE_DIR/package.json"
```

自己启动的 profile（例如 `dsh web`）还能直接核对合成树：

```sh
dsh --profile web --dump-config --patch dsh/cordis.patch.yml
```

桌面应用的 `desktop` profile 不允许 dump，用上面第 2、3 步代替。想确认宿主是否已经重新合成过，看 profile 根文件的写入时间即可（它在每次启动时被重写）：`stat -f '%Sm' "$PROFILE_DIR/cordis.yml"`。

## 与 Codex 的兼容

- Codex 打包 `pnpm pack:plugin` 使用显式文件白名单，`dsh/` 不进发布包；
- 技能正文只有 `skills/ggb-construction/SKILL.md` 一个来源，本目录不复制副本（测试有断言守住）；
- DSH 注入段只在加载时追加到内存中的正文，不写文件，Codex 读到的内容不变。

## 使用

技能进入目录后直接说题目即可；命令由注入段给出的绝对路径执行：

```sh
node <pluginRoot>/dist/src/cli.js doctor
node <pluginRoot>/dist/src/cli.js build --request <absolute-request.json>
node <pluginRoot>/dist/src/cli.js preview --delivery <absolute-delivery-dir>
```
