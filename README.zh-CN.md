# ggb-plugins

[English](README.md) | **简体中文**

把文字或图片中的二维数学题变成可交互的 GeoGebra 文件。宿主 Agent（Codex 或 DeepSeek Harness）理解题意并编写原生 Algebra／CAS 程序；本项目在本地执行、逐条件核验、导出 `.ggb`、重新加载，并交付文件、核验报告和截图。

支持中文和英文。Agent 根据你的偏好和上下文选择工作语言，保留题目原文，且只分析条件与构图方法，不替你给出题目答案。

## 需要什么

| 依赖 | 用途 |
| --- | --- |
| Codex 或 DeepSeek Harness（DSH） | 理解题意并编写原生 GeoGebra 程序 |
| Node.js 22+ 与 pnpm 11 | 运行本地 CLI、准备依赖 |
| `curl` 与 `unzip` | 下载并解压固定版本的 GeoGebra 运行时 |
| Google Chrome 或 Microsoft Edge | 核验时以 headless 方式驱动 applet |

不需要额外模型密钥。安装需要网络；GeoGebra 与浏览器不随包再分发。构建发布包时另外使用 `zip`、`tar` 与 `npm`。

## 安装

已公开资产见 [GitHub Releases](https://github.com/Jack7510/ggb-plugins/releases)。当前 Codex 安装引导改动尚未公开发布；本地包已包含引导 Skill。版本可用性、安装与运行依赖准备见各客户端说明：

- Codex：[安装与升级说明](codex/README.md)。
- DSH：[独立 headless profile 安装说明](dsh/README.md)。

DSH bundle 也已发布到 npm：`dsh plugin --profile desktop add ggb-plugins-dsh@0.8.2`。

桌面用户可以把[这一句安装指令](dsh/README.md#用一句对话安装桌面应用)粘贴到 DSH 对话框，由 DSH 代为安装。

两个客户端各自安装，共用同一套执行与核验管线。两份说明都以运行依赖准备（`setup-plugin`，会报告实际使用的浏览器）和就绪检查（`doctor`）结束。

## 第一道题

启用插件后，在新的宿主会话中直接描述题目，图片可以随题附上。

> 用 GeoGebra 作三角形 ABC，取 AB 的中点 M，连接 CM，把中线标红。拖动 A 验证中点和中线联动，保存文件并打开交互预览。

构造、重载和全部自动核验都以 headless 运行，不打开中间窗口。失败或无法核验的必需条件会阻止交付，而不是被跳过；失败会保留诊断，便于下一轮修正。必要条件缺失或歧义时 Agent 先澄清；未指定坐标时它会说明自行选择的初始构型。Agent 可以自行决定什么、不能决定什么，见 [Skill](skills/ggb-construction/SKILL.md)。

## 你会得到什么

成功运行写出一个交付目录：

| 文件 | 用途 |
| --- | --- |
| `<题目>.ggb` | 按题目命名的原生文件，可在 GeoGebra 中打开、查看并继续编辑 |
| `verification.json` | 逐条件结果：构造、重载与交互样本 |
| `preview.png` | 交付构型截图 |
| `request.json`、`manifest.json` | 输入留档与交付清单 |

报告会说明实际执行了哪些检查、有限交互样本覆盖到哪里，不会声称构成一般性证明。

交付目录位于 `<outputDir>/<题目>/delivery/`；`<题目>` 同时是 GGB 文件名，同名题目自动追加 `-2`、`-3`，不覆盖旧文件。

## 交互预览

预览加载同一份交付的 GGB，支持适用的点拖动、参数变化与缩放，且不回写交付文件。预览进程在页面加载后自动退出，窗口继续可用；需要重新加载时再执行一次 preview；一次性宿主退出后进程可能被回收。自动复核加 `--headless`。

## 直接使用 CLI

宿主会替你调用这个 CLI，其他本地工具也可以直接驱动：

```sh
node <installed-plugin>/dist/src/cli.js doctor
node <installed-plugin>/dist/src/cli.js inspect --ggb /absolute/base.ggb
node <installed-plugin>/dist/src/cli.js build --request /absolute/request.json
node <installed-plugin>/dist/src/cli.js preview --delivery /absolute/delivery
```

已有 GGB 需要改颜色、线型、填充、可见性，或继续构造（增加对象、修改独立数值或坐标）时，在请求中声明 `base`；`inspect` 列出对象清单、当前值以及请求必须写入的摘要。删除、重命名和视图修改不支持。请求编写方式见 [能力契约](skills/ggb-construction/references/capabilities.md)。

## 从源码运行

先满足上表依赖，然后：

```sh
pnpm install --frozen-lockfile
pnpm setup:runtime
pnpm build
pnpm demo
```

`pnpm demo` 会把内置三角形示例构造到 `output/`。验证与维护命令、Agent 的工作规则以及发布流程都在 [AGENTS.md](https://github.com/Jack7510/ggb-plugins/blob/main/AGENTS.md)，这里不重复。

## 仓库结构

- `src/`：CLI、执行、核验与交付管线。
- `viewer/`：承载 GeoGebra applet 的本地页面。
- `skills/`：两个宿主共用的 Skill。
- `codex/`、`dsh/`：各宿主的插件资产、安装说明与验收记录。
- `examples/`、`tests/`：可运行输入与回归用例。
- `scripts/`：依赖准备、两种打包与覆盖记录工具。
- `docs/`：[需求与设计](https://github.com/Jack7510/ggb-plugins/blob/main/docs/ggb-plugins-design.md)、[重要修改记录](https://github.com/Jack7510/ggb-plugins/blob/main/docs/CHANGES.md)与跨客户端验收记录；历史阶段结果见[归档索引](https://github.com/Jack7510/ggb-plugins/blob/main/docs/archive/README.md)。

## 支持范围与边界

- 支持：二维几何、函数、方程、微积分、列表矩阵与统计，中英文均可。
- 不支持：三维构图、无法声明基线的外部 GGB 续题、一般数学证明。
- 原生命令可以接入，不等于全部命令与重载都已验收；边界见 [命令覆盖记录](skills/ggb-construction/references/command-coverage.md)。
- 数值采样与未决 CAS 结果是证据，不是证明。

项目采用 MIT 许可。GeoGebra 的独立许可与归属见 [第三方说明](THIRD_PARTY_NOTICES.md)。
