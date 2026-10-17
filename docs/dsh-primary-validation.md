# 修复与 DSH 主验证

日期：2026-10-16。本文记录当前未发布工作区；TGZ 版本字段仍为 0.8.0，不能与公开 0.8.0 资产混同。使用独立 profile `ggb-plugins-validation`，不修改既有 desktop 或 ggb-plugins profile。

## 修复及门禁

| 问题 | 已实现修改 | 验收依据 |
| --- | --- | --- |
| 独立参数样本漏掉往返状态 | 每个参数样本在同一副本恢复初值，重做全部初态核验及快照比较；先保存证据再判定 | 旧多边形前向通过、恢复失败，拒绝交付 |
| 动态多边形产生未定义附属对象 | 案例使用固定容量点列表、动态截取和闭合 Polyline；全部辅助对象始终定义 | n=4、6、12 各自往返到 3 后通过；完整对象门禁不变 |
| 可避免的请求编写错误 | CLI check 复用 schema／compile，先检查来源和声明引用；Skill 补充多输出、原生命名方程及直接依赖写法 | 不创建输出目录；来源漂移被拒绝 |
| 重叠点拖动等待超时 | 检查目标 10 屏幕像素内的其他可移动点，提前拒绝并记录目标及重叠对象；保存失败截图 | 旧轨迹初态被提前拒绝；没有用坐标设置代替鼠标 |

check 是结构预检，不证明原生命令语法、输出标签或数学结论正确。angle 通用采集尚未扩展；能力契约说明显式单位换算的当前写法。

多边形轮廓不使用填充面。辅助点数量由本题 n 的上限 12 决定，属于输入构法，不增加生产题型分支。周长由实际相邻点距离求和，不用 n×边长自证。闭合顶点、全部边长、圆上关系、周长及真实依赖继续核验。

参数报告新增 sample.roundTrip，包含恢复值和恢复后事实。preview 缺少对应证据时拒绝旧参数交付，要求重新 build；没有参数样本的旧交付不受此项影响。请求协议仍为 2，字段细节见 [能力契约](../skills/ggb-construction/references/capabilities.md)。

交付编排按构造、磁盘重载、采样、提交和失败清理职责提取同模块函数。没有新增服务层、数学命令包装、浏览器池或数学结果缓存。关闭资源后才提交，提交后的日志错误仍不能撤销交付。

## 核心回归

类型检查与构建通过。最终离线 46 项、真实浏览器 60 项、故障与启动 54 项通过。第一次回归发现交互统一入口绕过旧测试的拖动 mock，恢复编排对公开 dragPoint 的调用后，未改故障断言，重新通过全部受影响组。

新增回归包括旧动态多边形反例、新轮廓构法、删除参数往返证据时预览拒绝、重叠点提前失败与截图，以及无副作用结构预检。DSH 初版受影响案例的持续 headless 预览阻塞了宿主命令，随后增加 `preview --headless --once`。该模式通过全部原有预览门禁后释放资源；可见预览不允许 --once。额外交互回归三项及持续预览故障回归两项通过。初版中断日志单独保存，不计入最终包的验收。

原始日志和交互证据保存在 [本机验证目录](../output/dsh-primary-validation/) 与 [回归产物](../output/interaction-regressions/)。

## DSH 验收方法

从当前构建生成完整 TGZ，安装到独立 profile，并执行安装副本自身的 setup-plugin。GeoGebra 从官方资源下载并校验固定摘要；没有复制开发仓库或 Codex 的 runtime。安装副本的八个编译模块、viewer、Skill、能力引用及 runtime 锁共 12 个文件与工作区逐字节一致。

该一致性属于当次构建，随后一度漂移：Skill 与能力引用在工作区继续修改，安装副本曾与工作区不同（`dist` 始终一致）。同日已按当前构建重新打包并重装到同一 profile：`dist/src/delivery.js`、`SKILL.md`、`references/capabilities.md` 与工作区逐字节一致，安装副本 doctor 的 smoke 与 casSmoke 通过，runtime 5.4.932.1 与锁文件一致。记录见 [reinstall.json](../output/dsh-stability-prep/reinstall.json)；运行前的版本对比仍以 `provenance.json` 为准。

受影响案例 01、05、08、10 先各执行一个新 DSH 会话。随后完整十题各执行三个新会话。每个工作目录初始为空，位于仓库外的 /private/tmp；不传已有请求，不复用会话 ID，不将成功草案提供给下一轮。模型与认证沿用 DSH 既有配置，不新增模型服务或凭据。

题干唯一来源是 `examples/geometry-benchmark/*.json` 的 `prompt` 字段；`plan` 是答案键，脚本既不读取也不传给宿主，宿主提示也禁止读取该目录。`provenance.json` 记录提交、插件版本、逐题题干摘要，以及安装副本与工作区在 `dist` 与 Skill 文件上的 SHA-256 对比，用于说明本次测的是哪个版本。

宿主负责题意、构法、请求和最多三次 build 修复；外层脚本只记录事件并对实际交付执行生产 headless preview 复核，不补写数学程序。所有自动验收 headless，最终可见展示由持续调用方负责。

记录宿主墙钟、step_end 的实际 token 用量、check／doctor／build 命令次数、逐次 run.json、参数往返证据及最终交付摘要。模型未提供 usage 时记录缺失，不能当作零。工具接收时间用于诊断；不能把事件间隔全部当作纯模型推理时间。失败、超时和不完整覆盖均保留。

DSH 生成不同程序、对象和检查，不能直接与上一轮 Codex 编写固定请求的 CLI 耗时计算提速比例。既有 [十题报告](geometry-benchmark.md) 作为已知反例和工具成本基线。

## DSH 实测结果

smoke 已完成：01、05、08、10 各一个新会话，共 4 行结果。01、05、10 交付（2.52 M、3.54 M、0.88 M token；337 s、508 s、182 s）；08 三次 build 全部失败、未交付（4.16 M token，756 s）。四会话合计 11.11 M token，其中 cacheRead 10.65 M、输入 0.19 M、输出 0.27 M。

08 的失败定位到会话自查的请求本身：该会话使用 `poly=Polygon(A,B,n)`，n=4 时通过，参数回退到初值 n=3 时第 4 个顶点与第 4 条边未定义，被 `objects_defined` 拒绝。这属于门禁正确拦截，不是误判；修复这类写法所需的“固定容量点列表＋动态截取＋闭合 Polyline”说明当时尚未进入该安装副本的能力引用（见上文版本差异）。

早期 smoke 使用脚本内置的截短题干，其结论只在那个口径下有效。改用 fixtures 完整 `prompt`、并把安装副本更新到当前构建后，已重跑同 4 题各一个新会话：交付 3/4（01、05、10），08 三次 build 全部失败；合计 7.79 M token、1521 s。08 这一轮的失败原因与旧批不同（`Text` 定位点用了小写开头标签），逐题结果、失败归因与零成本复现变体见 [求解稳定性 pilot 报告](dsh-solve-stability-pilot.md)。

上述失败归因促成了两项修改并已复验：Skill 补充 `Text` 定位点命名与同址固定点规则，拖动诊断扩展到 `fixed:true` 的同址点（10 题夹具 10/10 与边界输入无误拒，`pnpm test:browser` 全绿）。重新打包（sha256 `9a94b5f5…b7ce`）并装回同一 profile 后，08 单题新会话已交付（2 次 build、3 个参数往返、46 项检查）。细节见同一报告的修复与复验一节。

full（十题各三个新会话）尚未运行；未将计划中的 30 次计为已通过。

## 复现与证据

开发脚本 [benchmark-dsh.mjs](../scripts/benchmark-dsh.mjs) 接受输出目录、实际安装包路径以及 `smoke`、`full` 或 `list`。`list` 只读取题干并写出 `provenance.json`，不启动任何宿主会话，可用于零模型成本的口径与版本核对。脚本不进入插件生产管线，不复制模型循环。再次实验需使用新的输出目录和独立工作目录，避免继承已完成会话。

```sh
node scripts/benchmark-dsh.mjs output/dsh-stability-prep <installed-plugin> list
node scripts/benchmark-dsh.mjs output/dsh-stability-<n> <installed-plugin> smoke
node scripts/benchmark-dsh.mjs output/dsh-stability-<n> <installed-plugin> full /private/tmp/ggb-dsh-stability-<n>
node scripts/benchmark-dsh.mjs output/dsh-stability-<n> <installed-plugin> full /private/tmp/ggb-dsh-stability-<n> 01,05,08,10
```

早期 smoke 使用脚本内置的截短题干（缺自选初态、非退化等约束），且当时安装副本的能力引用尚未包含上述可变数量构造段，因此与今后使用完整 `prompt` 的实验不可直接比较；该批结果保留为历史证据。

重装该 profile 时使用插件固定的 pnpm 11.7.0（例如把 `/opt/homebrew/bin` 置于 PATH 首位）。若 PATH 首个 pnpm 为 12.x，安装副本的 setup-plugin 会以 `ERR_PNPM_PACKAGE_MANAGER_NO_IMPORTER` 拒绝包内 frozen lockfile；这是工具链版本问题，不是插件缺陷。

完整架构、生命周期和提交不变量见 [设计](ggb-plugins-design.md#5-流程与画布生命周期)。本文只记录局部行为和验收，不重复维护状态协议。采用 STE 中文清晰写作原则，不声明 ASD-STE100 合规。
