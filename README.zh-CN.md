# ggb-plugins

[English](README.md) | **简体中文**

把文字或图片中的二维数学题变成可交互的 GeoGebra 文件。支持 Codex 与 DeepSeek Harness（DSH）：宿主 Agent 理解题意并编写原生 Algebra／CAS 程序，本地工具执行、核验、导出并重新加载，交付 `.ggb`、报告和截图。

支持中文和英文工作语言。Agent 根据用户偏好和上下文自行选择回复、讲解及图中文字的语言，并保留题目原文和条件来源。

本插件不增加模型服务或额外模型密钥。新题通过程序和检查组合表达，适用于二维几何、函数、方程、微积分、列表矩阵和统计等问题。它不提供外部 GGB 续题、三维构图或一般数学证明；原生命令开放也不表示全部命令及重载已经验收。

## 安装

[GitHub Releases](https://github.com/Jack7510/ggb-plugins/releases) 提供 Codex ZIP、DSH TGZ 和各自校验文件。安装完整包，并在实际安装副本中准备运行依赖：

- Codex：[安装与升级说明](docs/installation.md)。
- DSH：[独立 headless profile 安装说明](dsh/README.md)。

两个客户端各自安装，同样使用一套数学执行与核验管线。源码开发从 [AGENTS.md](https://github.com/Jack7510/ggb-plugins/blob/main/AGENTS.md) 开始。

## 提交一道题

插件启用后，在新的宿主会话中直接提出题目，图片可以随题附上。例如：

> 用 GeoGebra 作三角形 ABC，取 AB 的中点 M，连接 CM，将中线标红。拖动 A 验证中点和中线联动，保存文件并打开交互预览。

本插件只分析条件和构图方法，不提供题目答案。例如可以要求“绘制函数 y=x²−5x+6 的图像，用于观察与探索，不给出零点答案”。没有必要条件时 Agent 会澄清；未指定坐标时应说明自行选择的初始构型。具体输出边界见 [Skill](skills/ggb-construction/SKILL.md)。

构造、重载和自动核验使用 headless 浏览器，过程中不打开中间窗口。失败时保留诊断；无法核验的必需条件不能作为成功交付。对成功结果，报告会说明实际检查与有限交互样本的范围。

## 交付与预览

成功后得到一个完整 delivery 目录：

| 文件 | 用途 |
| --- | --- |
| result.ggb | 可在 GeoGebra 中打开和编辑的原生文件 |
| verification.json | 数学条件、重载及交互核验报告 |
| preview.png | 原始交付构型截图 |
| request.json、manifest.json | 输入留档和交付清单 |

交互预览加载同一 GGB，支持适用的点拖动、参数变化及缩放，不回写交付文件。需要手动调用或接入其他本地工具时：

```sh
node <installed-plugin>/dist/src/cli.js doctor
node <installed-plugin>/dist/src/cli.js inspect --ggb /absolute/base.ggb
node <installed-plugin>/dist/src/cli.js build --request /absolute/request.json
node <installed-plugin>/dist/src/cli.js preview --delivery /absolute/delivery
```

已有 GGB 需要改颜色、线型、填充或可见性时，在请求中声明 `base`；`inspect` 列出对象清单与请求必须写入的摘要。请求编写方式见 [Skill 能力契约](skills/ggb-construction/references/capabilities.md)。自动复核预览加 `--headless`。预览需要持续运行的调用方保留进程；一次性宿主退出后，窗口不保证继续可用。

保持预览进程，按 Ctrl+C 可结束会话。浏览器选择和关页退出行为以所用版本为准，发布版本与未发布预览改动的区别只在 [修改记录](https://github.com/Jack7510/ggb-plugins/blob/main/docs/CHANGES.md)维护。

## 仓库入口

- `src/`、`viewer/`：本地执行、核验与页面。
- `skills/`、`dsh/`：共享 Skill 和宿主接入。
- `examples/`、`tests/`：可运行输入与回归用例。
- `scripts/`：依赖准备、两种打包和覆盖记录工具。
- [需求与设计](https://github.com/Jack7510/ggb-plugins/blob/main/docs/ggb-plugins-design.md)：为什么采用这些边界与门禁。
- [重要修改记录](https://github.com/Jack7510/ggb-plugins/blob/main/docs/CHANGES.md)：版本演进及对应验收证据。

项目采用 MIT 许可，GeoGebra 的独立许可和归属见 [第三方说明](THIRD_PARTY_NOTICES.md)。
