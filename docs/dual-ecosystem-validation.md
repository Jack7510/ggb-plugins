# 双生态安装验收

日期：2026-10-16。版本：0.8.0。平台：macOS arm64；Codex CLI 0.162.1，DeepSeek Harness 0.2.0-rc.2，Node 26.5.1，pnpm 11.7.0，GeoGebra 5.4.932.1。

## 构建与分发边界

此次工作区存在其他尚未提交的预览、页面及文档改动。验收从已提交源码建立干净副本，仅覆盖本次打包、DSH 适配和安装文档修改；不将这些未提交功能混入发布。

Codex ZIP 使用根 plugin.json、marketplace 和允许隐式调用的 Skill。DSH TGZ 使用 npm package.json 的 dsh.bundle.patch、Cordis 插入补丁和 skills 提供方。两者携带同一份 Skill 源资源和同一套编译 CLI、页面、锁文件及安装器，没有新的数学执行器或运行依赖。DSH 不查找 Codex 缓存，不要求开发 checkout。Node 从 PATH 运行，避免将 Electron 宿主程序当作 Node。

基线、安装分支、包内容及适配层测试共 42 项通过。真实 headless 构图回归 55 项、故障及启动回归 53 项通过，共 150 项。新增测试从独立 TGZ 加载提供方，验证本包资源路径、引用、模块字节及依赖一致性；显式配置不能混用两份包。原有旧 dist、部分 dist 和纯编译包安装回归保持通过。

证据根目录：`output/dual-ecosystem/`。包与摘要分别由 codex-package.json、dsh-package.json 索引。原始客户端日志可能包含个人路径或宿主配置，仅保留在本机忽略目录，不作为公开发布资产。

## Codex 安装与真实回合

通过本地 marketplace 安装编译 ZIP 到 `~/.codex/plugins/cache/ggb-plugins-local/ggb-plugins/0.8.0`，在实际安装副本执行 setup-plugin，几何与 CAS doctor 通过。全新 app-server 的 skills/list 发现启用的 ggb-plugins:ggb-construction，路径属于 0.8.0 缓存。记录：codex-installation.log、codex-setup.log、codex-registry.json。

另起真实 codex exec，不提供 Skill 名称或路径，只给文字题：圆心 O=(0,0)、半径 3，路径点 P 初始 (0,3)，作 OP 的垂直平分线，拖动 P 验证中点与垂直关系，并保存矩阵 {{2,1},{1,1}} 的行列式。客户端自行选用安装 Skill，未读取开发源码、tests 或 examples；构造、重载各 39 项检查通过，1 个真实鼠标样本通过，detA=1 保存在同一 GGB。

证据：codex-client/events.jsonl、codex-client/final.md，以及 `codex-client/output/circle-bisector-headless/delivery/ggb-IziFZb/delivery/` 的 GGB、请求、报告与截图。

## DSH 安装与真实回合

按用户选择，首次建立独立 `ggb-plugins` headless profile，使用原生 `dsh plugin --profile ggb-plugins add <tgz>` 安装。保留 base、headless 两个宿主 bundle，由插件管理器追加 @local/ggb-plugins-dsh；没有改动 desktop、web 或 dsh-tui profile。

在该 profile 的实际 npm 包目录执行 setup-plugin，生产依赖安装、独立 runtime 准备及两项 doctor 通过。真实宿主的 skills 服务成功 list/get：候选技能允许模型与用户调用，resourceBase 和加载正文均指向该 DSH 包；能力引用可读，CLI 路径位于该包。该检查使用仅存在本机临时目录的测试 overlay，随后 SIGTERM 正常清理。记录：dsh-installation.log、dsh-setup.log、dsh-registry.json。

另起真实 dsh headless 文字题回合：三角形 ABC 初始 (0,0)、(6,0)、(2,4)，AB 中点 M 与中线 CM 标红、显示点名，实际拖动 A；同时保存 x²−1 的因式分解。客户端自行调用 skill 工具并读取 DSH 包内引用及 CLI，没有使用 Codex 缓存。首次构造把 caption 与标签模式声明组合，实际样式不匹配，被核验门禁拒绝。第二次仅修正声明，保留数学、颜色与点名要求后成功；没有改工具源码或放宽容差。

构造、重载各 43 项检查通过，1 个真实鼠标样本通过，因式分解结果保存为原生对象。证据：dsh-client/events.jsonl、dsh-client/REPORT.md，以及 `dsh-client/ggb-3IeuuG/delivery/` 的完整交付。模型沿用宿主既有认证，本插件没有增加模型密钥或模型服务。

## 结论范围

实际安装和文字题交付证据分别属于 Codex CLI 与 DSH 独立 headless profile，不推导 DSH desktop、所有宿主版本、所有二维数学重载或公共插件市场审核已经通过。最终预览需由持续运行的调用方保持进程，自动验收全程 headless。

## 最终包复核

npm 会自动排除名为 pnpm-lock.yaml 的文件。DSH TGZ 因此携带同内容的 dependencies.lock；安装器还原后，以 --ignore-workspace 限定所有 pnpm 调用到本包，再执行 frozen 安装。新增包内容及安装分支断言已通过。真实 DSH setup 后，本包锁文件与源码完全一致，上层 profile 锁文件逐字节未变，证据见 dsh-install-isolation.json。

最终安装副本的八个编译模块、页面、两份安装器、runtime 锁、还原后的依赖锁及 Skill 资源共 16 个文件逐字节一致。分别用各自副本重新 headless 打开其真实回合交付，保存 ecosystem-preview.png，关闭页面后确认浏览器断开、服务不可访问、GGB 摘要不变。结果见 final-acceptance.json。最终两种宿主的技能发现和 DSH 引用加载也重新通过。

Codex GGB SHA-256：`0c2f69111b79b2f06da0153d81ef8de89bd100591fe98528f2df7286397721c3`；DSH GGB SHA-256：`bc6a1fc7e706347589b9e43bc747ab5882b31bde1e26aea26f73a0e493bda3c6`。

## 公开发布和最终来源

`v0.8.0` 固定到提交 `4971dff`。[发布工作流 38894317938](https://github.com/Jack7510/ggb-plugins/actions/runs/38894317938) 完整通过，实际发布 [0.8.0 Release](https://github.com/Jack7510/ggb-plugins/releases/tag/v0.8.0) 中的两种包与摘要。ZIP SHA-256 为 `68f6a8218b82f182e0f5107e4bd9d8ace708595f89d2091deb30f3a85d5334de`；DSH TGZ 为 `6b5c08b8fc4a14b2c507245683f3acb634e77b839b031f3c3606a9d7f4d392d2`。匿名下载、校验及共享文件对比均通过，记录在 public/acceptance.json。CI 只覆盖基础检查与打包，真实浏览器证据来自上述本机验收。

本机 Codex 最终 marketplace 来源为 `Jack7510/ggb-plugins --ref v0.8.0`，重新执行源码安装分支并通过 doctor。DSH 最终安装源为 `~/.dsh/local-packages/ggb-plugins-dsh-0.8.0.tgz`，来自校验后的公开资产；profile 仍为独立 ggb-plugins。两者均不依赖 output 内的临时打包来源。

公开来源安装后，再次通过两个实际宿主的 Skill 发现和加载、共享文件对比、headless 预览关页清理及 GGB 摘要不变检查。Codex 记录为 codex-registry-public.json，DSH 记录为 dsh-registry.json，安装日志分别为 codex-github-setup.log、dsh-public-installation.log 和 dsh-public-setup.log。

所有自动验收通过后，持续运行的调用方使用 DSH 安装副本打开本机 Google Chrome，展示 DSH 回合的原始 delivery。此次不把物理点击关闭窗口计为新的自动验收；关页退出和文件不变已在 headless 复核中检查。
