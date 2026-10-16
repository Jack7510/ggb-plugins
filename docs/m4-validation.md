# M4 安装与客户端验收记录

日期：2026-10-16。版本：0.4.0。目标为 macOS arm64 上的 Codex CLI 0.162.1 运行时，使用已登录的 ChatGPT 账户。桌面 UI 自动化被工具禁止，未把该界面的目录安装过程标为通过；其他操作系统和公共插件目录发布也不在本轮范围。

## 包与安装

按 [OpenAI 插件打包规范](https://developers.openai.com/plugins/build/plugins) 使用根 plugin.json、根 skills/ 和本地 marketplace；按 [本地执行声明](https://developers.openai.com/plugins/deploy/desktop-only) 设置 requires_local_executor。未增加 MCP、hook、常驻插件服务或运行依赖，src/ 构图管线没有修改。

`pnpm pack:plugin` 生成独立目录、ZIP 和 SHA-256 文件。ZIP 内共 22 个文件：八个编译模块、Skill 及其两个支持文件、页面、根清单和 marketplace、两项安装脚本、package.json、两个锁文件、安装 README、LICENSE 和第三方说明。源码、测试、开发文档、node_modules、runtime、Chromium 及用户产物不随 ZIP 分发。为保持 frozen lockfile 一致，package.json 保留开发依赖元数据；ZIP 安装使用 --prod，不安装开发工具。

初始 M4 本地产物位于 `output/plugin/ggb-plugin-1AOYmK/`，ZIP 为 `ggb-plugins-0.4.0.zip`，摘要为：

```text
b5a6075e329336585c09896be254f28d305f5a36728dc1b0c55850a20819b024
```

实际执行 `codex plugin marketplace add <plugin>`、`codex plugin add ggb-plugins@ggb-plugins-local --json` 和 plugin list。客户端将插件复制到 `~/.codex/plugins/cache/ggb-plugins-local/ggb-plugins/0.4.0`，报告 installed、enabled 均为 true。无兼容清单或手动复制 Skill 到全局技能目录。

在安装缓存运行 setup-plugin，生产依赖安装和 doctor 通过。官方 runtime 网络下载较慢，本轮使用已有 ZIP 缓存 `ggb-math-apps.zip`，其 SHA-256 与 runtime.lock 完全一致；安装器仍先验证摘要再解压，没有复制开发仓库的已解压 runtime 或跳过校验。Chromium 使用匹配的 revision 1248。

另在 `/private/tmp/ggb-m4-source with spaces` 准备无 dist、无 node_modules 的独立源码目录，执行同一安装器：安装开发依赖、编译、准备 runtime 和 doctor 均通过。初始实现再次执行时会切换为生产依赖分支，doctor 继续通过；这一分支判断是下述 Review 修复的问题。源码启动分支已验证；本轮没有通过 GitHub 网络来源重新安装，GitHub 安装命令见安装说明。

## 自动发现与完整链路

在仓库外的新工作区调用真实 Codex app-server 的 skills/list，发现：

- name：`ggb-plugins:ggb-construction`
- pluginId：`ggb-plugins@ggb-plugins-local`
- enabled：true
- path：安装缓存中的 `skills/ggb-construction/SKILL.md`

新会话只收到以下文字题，没有指定 Skill 名称、SKILL.md 路径、构图模板或预生成请求：

> 作三角形ABC，取AB的中点M，连接CM，将中线标红。请交付可交互的GGB文件并打开预览。题目未给坐标，可自行选择并说明初始构型。把请求、产物和报告保存在当前工作目录。

模型自行选择已安装 Skill，并读取其缓存内的说明和能力契约。所有 doctor、build、preview 命令均调用安装缓存中的 CLI；工作区没有开发仓库、src/ 或项目 AGENTS.md。

模型选择 A=(-4,0)、B=(4,0)、C=(1,5)，组合 Polygon、Midpoint 和 Segment，保留条件来源、呈现检查及三个真实拖动样本。GGB 构造和重载各 22 条结果 passed；A、B、C 的三个拖动样本及缩放通过。截图已查看，名称、三角形和红色中线符合要求。

宿主保持标准 app-server 连接。turn/completed 后，从 CLI 就绪输出取得预览地址，立即及三秒后均收到 HTTP 200；后续复查仍存活。前台进程由该客户端保留，关闭预览浏览器即可结束对应进程。验收只驱动现有 Codex 协议，没有为插件添加后台服务。

客户端原交付目录为 `/private/tmp/ggb-m4-live-client-v2/artifacts/ggb-SEoffk/delivery`。正式文件和精简证据副本位于本地忽略目录 `output/m4-client-acceptance/`。不提交用户产物、完整模型事件或宿主推理记录。

初始 M4 ZIP 除安装 README 的补充说明外，其余 21 个文件与已安装、已执行副本逐字节一致。按相对文件名排序，依次累计文件名与内容的 SHA-256 为：

```text
7214cdbb9833a37ca2bb7fea46a05ab242a1d802488698d81f4e89627de445e4
```

## 回归与边界

| 检查 | 结果 |
| --- | --- |
| 类型与编译 | pnpm check、pnpm build 通过 |
| 基础与打包测试 | pnpm test：24 项通过；归档摘要、包内容、相对资源路径和发现策略均检查 |
| 可见浏览器回归 | GGB_HEADED=1 pnpm test:browser：15 项构图、40 项故障与启动验收通过 |
| 已安装客户端 | A1 独立安装、A2 自动发现及完整链路通过，范围限上述 CLI 运行时 |
| 既有验收 | A3–A10 见 M3，A11 跨题复用见 M2；统一执行及核验管线保持不变 |
| Skill 与文档 | Skill 校验及 git diff --check 通过 |

一次性 codex exec 可以完成构图和打开预览，但进程退出时会回收其前台会话。本轮因此使用保持连接的真实客户端，而没有把刚返回就绪视为持久展示成功。使用方法明确要求交互客户端或保留连接的宿主。

桌面 UI、全平台安装和公共目录发布没有验证，不能从 CLI 结果推断通过。已验证的是根清单的真实安装、缓存资源路径、自动技能选择和前台预览链路。安装仍需要 Node.js、pnpm 和本地执行权限；没有声明首次安装完全离线，也没有绕过正常自动审批。


## 安装器 Review 修复验收

存在 src/cli.ts 时，安装器始终安装构建依赖并执行 pnpm build。只有无源码且存在 dist/src/cli.js 时，安装器使用 --prod。没有增加缓存判断或构图执行分支。

新增三项隔离回归：源码带旧 dist、源码带部分 dist、纯编译发布包。测试替换外部包管理命令，执行真实安装脚本，检查依赖参数、执行顺序及最终 CLI 输出。前两项必须运行更新后的产物；第三项必须保留发布产物且不执行构建。

另在带空格路径的独立源码副本中分别写入不可执行的旧 CLI、删除 doctor.js，真实安装器均重新编译并通过 doctor。新 ZIP 解压到独立目录后，安装器跳过开发依赖，真实 doctor 通过；runtime 使用与锁文件摘要一致的官方 ZIP 缓存。

本轮重新生成的包为 `output/plugin/ggb-plugin-VhwNlA/ggb-plugins-0.4.0.zip`，SHA-256 为：

```text
a6771b5de696ced600c5b7c50959ee0d12a08aebbf6753165c2eae37558f64a7
```

上述初始 M4 自动发现和客户端验收记录仍对应原安装副本。本次未重新执行客户端自动选择 Skill；本轮验证范围为安装分支及既有回归。

修复后 pnpm check、pnpm build、pnpm test（27 项）、pnpm test:browser（15 项构图、40 项故障与启动测试）、pnpm pack:plugin 及 git diff --check 均通过。浏览器回归使用 headless 模式；本次未重跑 headed 模式。

## 静默验证与最终 Chrome 展示

构图、doctor 和全部自动回归固定使用 headless。自动化 CLI 预览添加 --headless；不再使用 GGB_HEADED 环境变量切换回归窗口。启动故障测试同时断言 headless 和测试浏览器通道。截图仍保存在交付目录。

最终 preview 使用本机 Google Chrome。2026-10-16 本轮 pnpm check、pnpm build、27 项基础测试、15 项构图回归、40 项故障与启动测试、Skill 校验、打包及 git diff --check 均通过。三角形样例静默交付到 `output/headless-preview/ggb-WfqTjq/delivery`，随后 Chrome 加载同一 result.ggb，完成重载核验并返回就绪 JSON。预览前台会话保留，用户关闭展示浏览器后释放资源。

新包为 `output/plugin/ggb-plugin-22YtV8/ggb-plugins-0.4.0.zip`，SHA-256 为 `2157035a7b2505d0bba9478bb77b6ad3718d492f73c9047fc6376b233e9a5e80`。本轮未重新执行安装后的 Skill 自动发现。

## 0.4.1 本机更新与新文字题验收

日期：2026-10-16。同步更新 package.json 和 plugin.json 为 0.4.1，重新打包并通过 codex plugin marketplace/add 安装。安装缓存为 `~/.codex/plugins/cache/ggb-plugins-local/ggb-plugins/0.4.1`；22 个发布文件与包逐字节一致。生产依赖安装、固定 runtime 摘要核验及 headless doctor 通过。

新包：`output/plugin/ggb-plugin-djdlc3/ggb-plugins-0.4.1.zip`。SHA-256：`e32c9851e49274f7f38c1be84c83b859068d92cc3ad77241517c64d74b02691b`。

在仓库外的新工作区启动真实 Codex CLI app-server 会话。skills/list 自动发现已启用的 0.4.1 Skill；只向模型提交文字题，没有指定 Skill 名称、路径或预生成程序：

> 作任意非退化三角形 PQR 的外接圆。通过 PQ 和 PR 的垂直平分线确定圆心 O，连接 OP、OQ、OR，将外接圆标蓝。拖动三个顶点时，圆仍经过 P、Q、R，三条半径保持相等。

模型自行读取安装缓存中的 Skill 和能力契约，选择 P=(-3,-1)、Q=(3,-1)、R=(1,3)，生成组合程序。构造与重载各 68 项检查通过；三个顶点各一次实际拖动及缩放通过。全部构图、doctor、预览测试和独立复核均使用 headless，截图已保存并查看。首次 doctor 因沙箱本地端口限制失败，正常自动审批后重试成功，未更改插件或绕过核验。

正式交付位于 `/private/tmp/ggb-041-circumcircle-DuoA9d/output/ggb-PPGkxw/delivery`；交付、截图和精简证据的持久副本位于本地忽略目录 `output/0.4.1-acceptance/`。有限拖动样本不代表对所有构型的数学证明。类型检查、构建、27 项基础与打包回归及 git diff --check 通过；未重复执行既有 55 项浏览器回归，当前执行代码未修改。

独立复核成功、headless 测试会话关闭后，才向同一客户端发送展示指令。客户端用已安装 CLI 在本机 Chrome 加载原 result.ggb，返回就绪；回合结束时及三秒后均收到 HTTP 200。前台客户端连接继续保留，关闭展示浏览器后释放资源。本轮验收范围仍为真实 CLI 运行时，不扩展为桌面插件目录 UI 验收。
