# GeoGebra Construction 安装与使用

本插件在本地 Codex 中处理文字或图片中的二维数学题，交付可交互 GGB、核验报告和截图。
安装流程为：取得完整包 → 注册插件源 → 安装 → 运行设置 → 新对话作图。

## 版本与适用范围

当前版本为 **0.8.5**。[GitHub Release v0.8.5](https://github.com/Jack7510/ggb-plugins/releases/tag/v0.8.5)
已提供 Codex ZIP 与校验文件；Codex 包尚未提交公共插件目录。DSH npm 也已发布 0.8.5，
两个客户端各自安装，不能用 DSH 的发布状态推断 Codex 的安装状态。

本页的安装引导针对包含 `skills/setup/SKILL.md` 的 0.8.5 包；历史包不承诺有设置入口。

需要支持本地插件的 Codex 客户端、PATH 中的 Node.js 22+、pnpm 11、curl、unzip，
以及 Google Chrome 或 Microsoft Edge。从 GitHub 安装还需要 Git。
安装需要联网；GeoGebra 和浏览器不随包分发，不需要额外模型 API Key。
本地执行器要求见包根目录 `plugin.json`，不能把本流程视为浏览器版云端安装验收。

## 用一句对话安装本地包（推荐）

先取得维护者提供的同版本 Codex ZIP 与 `.zip.sha256`，把两个文件放在同一目录。
将真实文件绝对路径替换进下列指令，再粘贴到 Codex 本地聊天：

```text
请安装我提供的 GeoGebra Construction Codex ZIP：<ZIP绝对路径>，
校验文件：<SHA256文件绝对路径>。先核对 SHA-256，再解压并注册插件源，
安装 ggb-plugins@ggb-plugins-local。运行实际安装副本中的安装引导，
完成 setup-plugin 和 doctor 检查，报告版本与结果。不要借用开发目录或
其他客户端缓存，不修改已有题目和交付文件。若同名插件源已存在，先核对来源，
不要直接覆盖或移除。完成后提醒我在新对话中开始作图。
```

Codex 必须取得安装器完整退出结果。校验不符或 doctor 失败时，停止并报告具体错误，
不能告诉用户设置成功。系统依赖缺失时，先说明缺项，不擅自修改全局环境。

## 安装 ZIP（命令行）

以下示例针对 GitHub Release v0.8.5 的 Codex ZIP。
不要使用 GitHub 自动生成的 Source code ZIP 代替预编译插件包。

在存放 ZIP 和校验文件的目录执行：

```sh
shasum -a 256 -c ggb-plugins-0.8.5.zip.sha256
unzip ggb-plugins-0.8.5.zip
```

校验必须成功，才执行解压和安装。`<plugin>` 是解压后的 `ggb-plugins` 绝对路径。
先查询已注册来源；存在同名来源时，核对版本与用途后再决定如何更新。

```sh
codex plugin marketplace list --json
codex plugin marketplace add "<plugin>" --json
codex plugin add ggb-plugins@ggb-plugins-local --json
codex plugin list --marketplace ggb-plugins-local --json
```

从安装 JSON 的路径字段或插件列表取得 `<installed-plugin>`。该路径必须指向实际
安装副本，不能使用原解压目录或自行猜测版本缓存目录。

## 运行安装引导

支持安装设置入口的客户端可运行插件设置。也可在安装后新建对话并输入：

```text
请运行 GeoGebra Construction 的 ggb-setup 安装引导，准备当前安装副本，
确认 doctor 通过，并告诉我实际安装版本和使用的浏览器。
```

`plugin.json` 的 `extensions.com.openai.onboardingSkill` 指向包内安装引导。
入口是否显示取决于客户端版本。没有入口时，在聊天中调用引导或执行下面的命令：

```sh
node "<installed-plugin>/scripts/setup-plugin.mjs"
```

安装器安装锁定依赖，使用本机 Chrome／Edge，下载并按 SHA-256 校验固定 GeoGebra，
最后运行 doctor。源码安装会构建；预编译 ZIP 不需要源码。不要只复制 SKILL.md。

| 状态 | 成功判据 | 失败时的动作 |
| --- | --- | --- |
| 插件已安装 | 安装结果和路径指向预期版本 | 检查插件源与包内容 |
| 设置完成 | 安装器正常退出，doctor 为 ok，smoke 和 casSmoke 均 passed，工具版本一致 | 保留错误，修复依赖、网络或浏览器问题 |
| 可以作图 | 新对话可用 ggb-construction，首题通过构造、重载和适用交互检查 | 保留诊断，不放宽核验门禁 |

已有 runtime 不覆盖。版本不一致时，先核对目录用途。可将**新下载且已核对来源**的
官方 runtime ZIP 绝对路径作为安装器参数；安装器仍会校验锁定摘要。
不从其他 checkout、客户端或旧安装副本复制 `.runtime`、`dist`、`node_modules` 来验收首次安装。

安装设置入口的字段依据见
[官方插件打包文档](https://developers.openai.com/plugins/build/plugins#add-an-onboarding-skill)。
本项目的验收结果见[隔离安装记录](docs/codex-onboarding-validation.md)，
客户端界面按钮与聊天中调用引导分开记录，不互相替代。

## 安装后使用

按客户端提示刷新或重启，再新建对话。新会话应发现 `ggb-construction`。

> 作一个三角形 ABC，取 AB 的中点 M，连接 CM，把中线标红。
> 拖动 A 检查联动，保存 GGB、核验报告和截图。

题目示例、交付格式与预览操作见
[项目说明](https://github.com/Jack7510/ggb-plugins/blob/main/README.zh-CN.md#第一道题)。
正常使用会在完整核验后打开预览；自动验收使用 headless，不操作用户已有浏览器。

## 从 GitHub 安装（公开发布之后）

未来发布后，可从已有 marketplace 安装，无需用户克隆和手动构建仓库。
先在 GitHub Releases 确认目标标签存在，再替换 `<已发布标签>`：

```sh
codex plugin marketplace add Jack7510/ggb-plugins --ref <已发布标签>
codex plugin add ggb-plugins@ggb-plugins-local --json
```

然后按本页运行安装引导。Git 来源包含源码；安装器会重新构建，不能把陈旧 dist 当作成功。
固定标签不自动切换到其他版本。安装 0.8.5 请使用 Release 中的 ZIP 和 `.sha256`，
不要用 Source code ZIP 代替预编译包。

## 更新与卸载

本地 ZIP 更新需要先取得新包、校验摘要，再核对同名 marketplace 的来源。
Git 来源可刷新，但固定标签仍指向该标签；切换版本前应确认需要保留的安装与用户产物。

```sh
codex plugin marketplace upgrade ggb-plugins-local
codex plugin remove ggb-plugins@ggb-plugins-local
codex plugin marketplace remove ggb-plugins-local
```

安装新版本后重新运行安装引导，并使用新对话。升级、卸载不删除工作区中的交付文件。

GeoGebra 的许可和归属见包内 THIRD_PARTY_NOTICES.md。有限采样不构成一般数学证明。
DSH npm 安装另见 [DSH 安装说明](https://github.com/Jack7510/ggb-plugins/blob/main/dsh/README.md)，
不能用 DSH npm 版本推断 Codex 标签或安装状态。
