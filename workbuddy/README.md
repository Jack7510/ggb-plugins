# GeoGebra Construction 安装与使用（WorkBuddy）

本插件在 WorkBuddy 中处理文字或图片里的二维数学题，交付可交互 GGB 文件、核验报告和截图。
安装流程为：取得完整包 → 装入 WorkBuddy → 运行首次设置 → 新会话作图。
数学能力、核验门禁和请求契约与 Codex、DeepSeek Harness 版本完全相同，三处不各自维护。

## 版本与适用范围

插件包与 Codex、DSH 同版本构建，当前为 **0.8.5**，由 `pnpm pack:workbuddy` 产出 ZIP 与
`.zip.sha256` 校验文件。该 ZIP 尚未随 GitHub Release 发布，也未提交 WorkBuddy 插件市场；
装包前先确认来源与校验值。插件格式通过、本地装载成功与公共市场上架是三件不同的事，
不能用其中一项推断其余两项。Codex 与 DSH 各自发布、各自安装，不要用本页结果判断
它们的安装状态。

## 需要什么

| 依赖 | 用途 |
| --- | --- |
| WorkBuddy 客户端（支持插件目录） | 装载技能并提供本地命令执行 |
| Node.js 22+ 与 pnpm 11 | 运行本地 CLI、准备依赖 |
| `curl` 与 `unzip` | 下载并解压固定版本的 GeoGebra 运行时 |
| Google Chrome 或 Microsoft Edge | 核验时以 headless 方式驱动 applet |

安装需要联网。GeoGebra 运行时和浏览器不随包分发，也不在设置阶段下载浏览器。
不需要额外模型密钥。

## 安装

三种方式按可用性选择一种；首次接入建议先用方式一确认能装载。

### 方式一：直接加载本地目录（不安装）

```sh
codebuddy plugin validate ./ggb-plugins
codebuddy --plugin-dir ./ggb-plugins
```

`--plugin-dir` 不写缓存，适合核对清单与技能是否被发现；同名市场插件在本次会话中让位给本地副本。

### 方式二：市场安装

```text
/plugin marketplace add <仓库或 marketplace.json 的地址>
/plugin install ggb-plugins@<市场名>
/reload-plugins
```

安装后必须执行一次 `/reload-plugins`，否则技能不会出现在列表里。

### 方式三：手工放入版本化缓存

WorkBuddy 只从版本化缓存加载已安装插件，路径为
`~/.workbuddy/plugins/cache/<市场名>/ggb-plugins/<版本>/`：

```sh
shasum -a 256 -c ggb-plugins-workbuddy-0.8.5.zip.sha256
unzip -q ggb-plugins-workbuddy-0.8.5.zip -d /tmp/ggb
mkdir -p ~/.workbuddy/plugins/cache/local/ggb-plugins/0.8.5
cp -R /tmp/ggb/ggb-plugins/. ~/.workbuddy/plugins/cache/local/ggb-plugins/0.8.5/
```

随后 `/reload-plugins`。这种方式不受市场管理，升级需要手工替换整个目录。

## 首次设置（每个安装副本一次）

```sh
node <plugin>/scripts/setup-plugin.mjs
```

`<plugin>` 指插件安装根，也就是 `dist/`、`viewer/`、`scripts/`、`skills/` 所在的目录；
从技能目录向上两级即可定位。设置脚本会还原依赖锁、安装生产依赖、报告将要使用的浏览器、
下载并校验固定版本的 GeoGebra 运行时，最后运行一次 `doctor`。

需要单独复查时就绪检查：

```sh
node <plugin>/dist/src/cli.js doctor
```

`doctor` 必须报告 `smoke` 与 `casSmoke` 通过。它只检查当前这份安装副本，不会借用 Codex
或 DSH 的安装目录与缓存。

## 升级后必须重跑设置

插件装在版本化缓存里，升级会整体替换该目录，而 `.runtime`（约 116 MB）与 `node_modules`
（约 51 MB）不在发布包内。升级后重新执行 `setup-plugin`；跳过这一步时 `doctor` 会报告
运行时缺失，而不是静默降级。手工安装方式尤其容易漏掉这一步。

## 用一句对话安装

把 ZIP 与校验文件的绝对路径替换进下面这段，粘贴到 WorkBuddy 对话：

```text
请安装我提供的 GeoGebra Construction WorkBuddy 插件包：<ZIP绝对路径>，
校验文件：<SHA256文件绝对路径>。先核对 SHA-256，再用 codebuddy plugin validate
检查包根清单，然后装入插件目录并 reload-plugins。运行实际安装副本中的
scripts/setup-plugin.mjs 完成依赖、运行时与 doctor 检查，报告版本与结果。
不要借用 Codex 或 DSH 的安装副本，不修改已有题目和交付文件。
完成后提醒我在新会话中开始作图。
```

Agent 必须取得设置脚本的完整退出结果。校验不符或 `doctor` 失败时停止并报告具体错误，
不能声称安装成功。

## 排障

| 现象 | 处理 |
| --- | --- |
| 技能列表里没有本插件 | 执行 `/reload-plugins`；确认 `.codebuddy-plugin/plugin.json` 的 `name` 为 `ggb-plugins` |
| 提示找不到 `dist/src/cli.js` | 包不完整，重新解压；不要只复制 `skills/` 目录 |
| `doctor` 报告运行时缺失 | 在该副本执行 `scripts/setup-plugin.mjs` |
| 找不到可用浏览器 | 安装 Chrome 或 Edge，或用 `DSH_GGB_BROWSER` 指定内核名与可执行文件绝对路径 |
| 升级后无法作图 | 版本化缓存已被替换，重跑 `setup-plugin` |
| 其它失败 | 保留完整输出与错误码；同一失败不要原样重试，先修证据指出的根因 |

## 边界与许可

插件只做题意分析与作图，不提供题目答案或完整证明；不支持三维构图、删除与重命名已有对象。
自动核验使用 headless 浏览器并保存证据，成功后才展示最终预览。

项目采用 MIT 许可。GeoGebra 有独立的许可与归属要求，见包内 `THIRD_PARTY_NOTICES.md`。
