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

优先用 DSH 自带的插件管理器（在具备 `plugin_manager` 工具的会话里），它会完成装包与 bundle 选择：

```
plugin_manager  action: install_bundle   target: <repo>/dsh
```

没有该工具时，命令行等价路径是两步（`dsh plugin` 只是把参数转发给 profile 里的 pnpm）：

```sh
dsh plugin --profile web add /absolute/path/to/ggb-plugins/dsh
# 再把 "@local/ggb-plugins-dsh" 加入该 profile package.json 的 dsh.profile.bundles
```

新增 bundle 可以通过 HMR 生效；替换已安装包需要重启，才会加载新的 JS 模块。

装好后在**新会话**查看技能列表，应出现 `ggb-construction`。

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
node --test dsh/test/plugin.test.mjs
dsh --profile web --dump-config --patch dsh/cordis.patch.yml   # 确认 ggb-plugins-dsh 行已插入
```

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
