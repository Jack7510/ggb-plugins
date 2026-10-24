# 重要修改记录

只记录影响用途、行为、兼容性或维护方式的重要变化。这里说明“改了什么”；需求依据见[设计文档](ggb-plugins-design.md)，操作方法见 [README](../README.md)，具体测试与产物见对应验收记录。

## 未发布

- 清理维护项：删除 3 个无引用的题目笔记，合并 DSH 安装说明中的重复章节，
  把统一门禁验证与命令覆盖数据移入历史归档，并修正失效锚点和未使用的声明。
  无行为、协议或核验变化。
- 交付 `verification.json` 使用 compact JSON；运行诊断保留 pretty 副本。
  同一份 18 对象、每阶段 87 项检查的报告由约 1.47 MiB 缩到约 647 KiB，
  低于 DSH 1 MiB report 限制；报告内容、核验、GGB/预览/manifest 与回执不变。
  宿主 artifact 超限错误同时给出 kind、实际字节和上限，便于定位。
- 原生执行失败消息附带可执行的修复提示：位置参数 `Polygon(A,B,C)` 指向
  `Polygon({...})` 列表形式，`Round(...)` 指向小写 `round(...)` 函数。
  提示覆盖 native 下标、方括号和嵌套参数；通过 execute 和失败日志路径验证。
  只追加错误说明，不改写 source、失败分类、构建预算或核验结果。
- Worker 与参考明确：残差和面积和核验使用未取整原值，round 只处理显示副本；
  整数边数构造及其合法性检查保持不变。
- expression 核验失败产生有界 evidence.message，保留实际类型、定义状态、期望类型
  和失败类别；不把原始异常、值或对象快照写入摘要，不改变容差、灰区或准入结果。
  宿主复用既有 reason 契约贯通工具结果、run failure 与前端实时/重连显示。
- 固定 5.4.932.1 的真实输入栏/API 对照确认：最终检查中的 Vertex、Distance 有效；
  单等号产生未定义 line，双等号产生 boolean。数值残差使用独立 expected:0。
  参考增加 Focus 标签一致性及 Polygon 列表输入的准确示例，补全交付和拒绝回归。

- 真实输入栏与异步接口对照确认：`Element(Focus(ell),1)` 在 5.4.932.1
  中把第一个参数识别为 point，不能用作列表；`{Focus(ell)}` 显式包装后可索引
  两个焦点，并保留参数依赖和重载。能力参考补充多输出与列表的契约及示例。
  执行失败保留有界原始返回 rawLabels 与归一化 outputs，不自动改写模型 source。
  新增真实 UI/API 矩阵、失败反例及完整构建、重载与参数采样回归。

- 受限 `ggb_inspect` 新增 `references` 批量读取：最多 6 个固定主题、按首次出现去重，
  与单个 `reference` 互斥。完整序列化响应限 24 KiB；超限拒绝，不截断正文。
  Worker 按需合并相关主题，默认不读全量参考；四工具、权限边界和完整核验保持不变。
- check 主语数量错误携带 requirementId/checkId、实际主语及期望数量范围。
  verification 参考集中给出常用谓词的最小示例，明确位置核验与传递依赖核验的区别。
- 原子替换后父目录打开或同步失败时，返回 `AtomicFileDurabilityError`：替换已完成，
  持久性未确认。只在 rename 之前的失败保证旧目标保持，不做自动回滚。
- 增加[上游最小复现材料](directrix-upstream-repro.md)和独立 HTML，对同一固定官方 asset
  验证原始/修复行为；材料尚未提交上游。

- runtime asset 和审计 manifest 使用同目录临时文件、文件同步、原子 rename；POSIX
  同步父目录。写入、同步或 rename 失败不以部分内容替换旧文件，拒绝符号链接目标。
  公开审计记录包含 `patchId`、`sourceVersion`、`asset`、`originalSha256` 和
  `patchedSha256`。固定版本与双摘要校验继续失败关闭。CI 增加真实引擎对照矩阵；
  宿主负责 Client 归档供应、启动准入和旧 Service Worker 升级验收。

- 固定 runtime 的 Directrix 抛物线分支补齐内部路径起点初始化。原始 `Point(d)` 保留 initial、
  几何依赖、样式、拖动和重载，不改写为固定坐标或辅助直线。真实对照确认原始引擎在创建路径点时
  已产生非有限路径参数；setter 更新和 reload 才暴露坐标失效。插件资源服务按原始和修复后的
  文件 SHA-256 应用兼容补丁，其他字节不匹配时拒绝加载；官方归档不变，补丁随插件身份固定。
  公开 `runtime-compatibility` 入口供 Client 资产供应复用，覆盖 5.4.932.1 和 5.4.929.3。
  doctor 增加真实路径点样式与重载检查。未修复的外部 GeoGebra 引擎仍可能复现原缺陷。

- 原生执行保留第一个步骤异常的 stepId、命令摘要、operation 和 initial 的预期/实际状态；初始化后未定义或坐标非有限时立即拒绝，不继续构造。首错在交付失败日志中保留，后续清理诊断不替代它。新增纯 Node VM 与模块模拟的离线执行回归，不启动 applet。

- 样式应用统一读取前值并跳过相同值；每次真实 setter 后检查已定义对象及其值字符串，
  显示操作破坏构造时返回 `presentation_invariant_failed`，details 携带 object/field/before/target/affected。
  新建、编辑和续构统一走该样式事务，避免只报告下游 undefined。

- `ggb_check` 的结构错误现在携带 bounded details：requirement source 错误返回 requirementId、source 和可用来源；
  coordinate/expression 字段错误返回 checkId、非法字段和期望字段，模型不再只拿到泛化 message。
- native program 增加保守依赖预检：只检查原生命令参数中的裸标签，未知标签在 build 前拒绝并返回
  stepId/source/missing；复杂表达式和未知命令保持运行时校验，避免误报。

- Worker、Desktop Skill 与能力参考明确优先使用 GeoGebra 原生命令：
  `Focus`、`Directrix`、`Center`、`Midpoint`、`PerpendicularBisector` 等能表达的关系，
  不再由模型手算坐标再写死；固定坐标仅用于题目要求的固定值或原生命令无法表达的关系。

- `ggb_check` 对可静态判型的 native 输出提前校验 `pointOn` 第二主语；
  `segment` 等非 line/conic 主语在 build 前拒绝；create/modify 共享保守规则，
  结合基线类型。复合表达式、CAS、多输出和未知命令保留运行时校验。

- `requestText` 的 program 解析接受完整 native step（可选 `op: native`、`mode`），
  不再因模型提供完整 request plan 形态而报 `draft_program_fields`；非 native op 仍拒绝。

- 修复 requestText 契约：checks 嵌套在 requirements 内；同一草稿禁止混用整份与分段模式；修复继承语言、标题和转写；完整参数按转义后 UTF-8 字节限制，并与认证通道对齐。

- `ggb_request` 主路径改为单次完整 `requestText`：宿主注入 prompt/base，locale 通过外层参数指定，
  模型一次提交 plan 和 optional clarifications；避免按 section 多次往返。
  `ggb_check` 仍只接收 revision，`ggb_build` 使用 checkedRequestId。
  旧 section 操作保留为底层兼容，但不再出现在模型 schema 和 Worker Skill。

- 受限 SDK Server 保留旧 section 草稿作为底层兼容；模型-facing 主路径已改为单次 `requestText`。check/build 仍绑定不可变已检查版本，保留 CAS、initial、独立 expected、图片转写与完整核验。

- 原生输出标签解析忽略 GeoGebra 对可选结果返回的字面量 `undefined`/`null` 占位符并去重；`Focus(p)`、`Directrix(p)` 等有效命令不会再被误报为 `Incomplete native outputs`，并新增真实 applet 回归。

- Worker 在 `ggb_check`／`ggb_build` 失败时读取宿主返回的有界 `report.failedChecks`，优先修复实际失败的 requirement/check，不再根据泛化错误猜测。

- 核验参考补充实际类型与谓词约束：方程圆锥曲线按引擎 subtype 报告（`y^2=4x` 为 `parabola`，不是 `conic`），`perpendicular`／`parallel` 只接受 line，`pointOn` 的第一个 subject 必须是 point；避免把 segment、vector 或错误 objectType 写入核验。

- Codex 增加安装引导 Skill 和 onboardingSkill 声明，仅随 Codex 封装交付；安装说明区分本地 0.8.3 包、远端真实标签和 DSH npm 版本，安装验收见 [记录](../codex/docs/codex-onboarding-validation.md)。本轮不公开发布。

- 可见预览改为加载后自动退出：页面确认加载即释放本地服务并结束进程，已加载的 applet 在默认浏览器窗口中独立运行，避免后台常驻耗电；刷新页面需要重新执行 preview。

- 准备 0.8.3 本机 Codex 插件包，纳入英文 Applet 展示改动；发布范围与资产见 [0.8.3 说明](releases/v0.8.3.md)。DSH 仅验证封装，本轮不更新 npm 发布。

- Applet 原生界面固定为英文，代数区显示英文命令名；预览页面继续按 locale 显示状态和按钮，题目与 Text 内容保留原语言。数学核验与交付门禁不变。

- DSH bundle 发布为 npm 包 `ggb-plugins-dsh`（0.8.2），安装命令改为 `dsh plugin --profile desktop add ggb-plugins-dsh@0.8.2`；新增 `docs/publish-npm.md` 记录构建、暂存、2FA、占位包与常见错误。

- 最终 preview 默认提供原生工具栏与代数窗口，方便教学展示变量；展示页使用剩余浏览器视口并响应窗口尺寸变化。自动核验页维持原有尺寸和视图基准，正式 GGB 不回写。新增图形／代数视图、窗口缩放及事实保持回归。

- 准备 0.8.2：同步三份版本声明与能力清单，生成 Codex／DSH 两种封装，并安装到本机 Codex。资产摘要、检查结果及安装副本复跑见 [0.8.1 本机验收](../codex/docs/v0.8.1-validation.md)，对外发布说明见 [0.8.2](releases/v0.8.2.md)。本机安装不代表 GitHub Release 已发布。0.8.1 因一次未完成的 npm 暂存发布留下「已发布」记录，改用 0.8.2 发布。

- 归档 M1–M7、历史性能与基准记录及客户端阶段验收，共 16 份文档和数据文件；保留原结论与配套数据，调整仓库内引用。现行说明和历史证据通过 [阶段归档索引](archive/README.md) 区分，不改动源码、示例、核验门禁或被忽略的目录。

- 精简主 Skill 与 Worker，删除固定顶点、反射坐标和输出保留名豁免等冲突配方，保留来源、独立期望、动态证据及交付门禁。Skill 按操作读取契约章节；Worker 保留无文件权限的宿主边界。维护准入规则放在 AGENTS，提示体量检查覆盖两入口的行数、字节量与参考预算，不再只限制主 Skill 行数。修复两种安装包漏带 patterns.md，使按需参考在安装后也可读取。

- locale 跟随题目语言：构建/核验页与预览页都按请求 locale 显示提示与结束按钮，页面语言不符会拒绝；此前只有发布页跟随 locale，构建截图固定为英文。Skill 与能力契约同步约定中文题目用 zh-CN、英文题目用 en。

- Skill 只保留通用规则：动态是默认（可变量用滑块或可拖点，核验覆盖参数变化，给定数值时才固定）。具体构法与聚合核验移到新增的 `references/patterns.md`，`capabilities.md` 只规定字段与谓词；`examples/v2-cases/slider-polygon.json` 作为可变边数的回归样例。

- 交付命名改为按题目：请求新增可选 `title`（≤60 字），交付目录与 GGB 文件都取该名字，同名自动追加 `-2`、`-3`，不再使用随机 `ggb-XXXXXX` 与固定的 `result.ggb`；`outputDir` 建议填用户工作目录根。清单记录实际文件名，`preview` 按清单声明的文件名校验，旧交付仍可预览。新增离线命名回归。

- 运行时改用本机已安装的 Chromium 内核浏览器（Chrome／Edge，或 `DSH_GGB_BROWSER` 指定的频道／绝对路径），不再下载 Chromium：`playwright install chromium` 从安装器移除，改为启动前解析并报告目标浏览器。`doctor` 的 browser 字段改为报告实际使用的浏览器（`label` 加 `executablePath` 或 `channel`）。新增离线回归 tests/browser-target.test.ts，安装器回归改走浏览器探测。

- 修复验证截图的界面语言：新建、编辑、续构、重载和交互页面统一使用请求 locale，中文与英文共用 viewer 文案。就绪页面检查实际语言、标题、提示、页脚及结束按钮；文案不一致返回 viewer_language_mismatch 并阻止交付或预览。新增图形／代数视图、语言回退及错误文案回归。

- 统一对象身份、引擎依赖证据与外观归属；native／旧原语共用采样覆盖门禁。移除命令式“同义反复”检测和自制 LaTeX 标题转换，证据目的仅作记录。新建对象集中校验官方禁用标签和内置名称遮蔽，所有 id 与显式 outputs 共用，保留引擎核验。核验门禁与反例复验见 [统一门禁验证](archive/2026-10-18/unified-validation.md)。

- 修复代码审查发现的六处边界问题：等长谓词只接受真实线段；编辑和续构的初次核验未通过时禁止导出；ZIP 解压在分配内存时限制单条目与剩余总量；外部 GGB 和实际快照拒绝 XML 三维类型，防止 API 类型别名隐藏维度；条件来源不再接受 Agent 的提问；允许沿已声明更新依赖重算圆锥系数。三种构图模式共用导出、重载与原子提交，提交和预览共用证据复验。新增离线、真实 applet 与故障回归，保留不相关字段变化的拒绝和原文件只读规则。

- 将军饮马案例的可见文字改为构图和观察提示，保留全部数学检查与拖动样本。viewer 保留题干原文并支持长标题换行，不再自制 LaTeX 解释。Codex 安装副本复跑结果见 [验证报告](../codex/docs/archive/2026-10-18/codex-v2-validation.md)。

- 新增 `capabilities.json` 与 `skills/ggb-construction/worker.md`：插件是 Worker 提示词与能力契约的唯一来源。`capabilities.json` 由 `src/schema.ts` 和 `worker.md` 生成，包含请求协议版本、`pointOn` 支持的圆锥曲线类型、检查谓词、限额与 `workerSkillSha256`；ggb-agent Worker 启动时校验该哈希与 profile 版本，不匹配即拒绝启动。ggb-dsh 不再保存第二份完整 Skill。
- `check` 与交付报告明确执行证据的边界；当前使用 purpose 与 verificationNotes 记录证据目的，不按命令名认证独立性，见 [能力契约](../skills/ggb-construction/references/capabilities.md#通用核验)。
- `pointOn` 支持圆锥曲线（椭圆、双曲线、抛物线）：从归档的齐次矩阵取隐式方程，按点到曲线的距离核验；此前只支持直线与圆，椭圆上取点只能用参数表达式绕开。另把「非 expression 检查出现 expression 字段」和「expected 类型错误」的报错改成点名具体字段与实际值。
- Skill 与能力契约增加期望值规则：坐标、距离、面积、角度等 `expected` 必须按题目条件独立算出，不从失败证据、`inspect` 结果或上一轮观测里抄数值；失败后只改证据指出的那一项。评测中「将军饮马」连续三次构建都因自选期望值出错而耗尽构建次数。
- 执行失败区分「引擎未创建该标签」与「标签已创建但未定义」：`Execution failed or output undefined: hit; actual labels: ...; missing: hit (undefined)`，不再把未定义的几何结果（如不相交的圆求交点）笼统报成缺失。
- 诊断报错点名具体对象与检查：未知字段直接给出键名，顶层误放的 `interactions`／`styles`／`requirements`／`view`／`display` 提示放入 `plan`；subject 数量错误带需求 id 与谓词（`Check "m" midpoint: expected 3 subjects, got 2`）；谓词类型错误给出期望与实际类型（`Expected a line: s (segment)`）。需求 id 允许 `-` 与 `.`，因为它只作为证据键。
- `build` 执行失败时报出引擎实际返回的标签与缺失的输出名（`actual labels` / `missing`）；输出是否定义改为执行后判定，结构化步骤不再把尚未创建的输出误报为缺失。
- `check` 允许原生步骤的 `outputs` 声明 GeoGebra 自动生成、看起来像保留名的实际标签（例如多边形自动边 `i`）；步骤 `id` 仍拒绝保留名。此前多边形等命令无法完整声明自动输出标签。

- 新增已有 GGB 的显示属性编辑：`inspect --ggb` 列出对象清单与摘要，请求用 `base` + `edits` 声明颜色、线宽、线型、填充、可见性与标签可见性。交付额外保存 `base.ggb` 和 `diff.json`；门禁依次检查摘要、归档与脚本、对象可解释、逐字段读回、差异白名单与重载一致，preview 会重载内嵌基线并重算差异；多边形颜色/描边到其边对象的同步作为受控传播计入 `changes`，其它未声明差异仍失败。`edits` 本身仍只改显示属性；增删对象与受控改值使用下一条的修改模式。删除、重命名、改视图、脚本、自定义工具、图片／按钮／三维材料不在支持范围，见[设计 4.4](ggb-plugins-design.md#44-ggb-属性编辑p0) 与[能力契约](../skills/ggb-construction/references/capabilities.md#编辑已有-ggbp0)。已用 10 对象、22 对象（外部 5.4.916.2 文件，含撇号与希腊字母标签）与 30 对象基线完成真实浏览器编辑与重载验收；归档 XML 实体在读取时解码，非 ASCII 标签可直接作为编辑目标。

- 新增已有 GGB 的构造修改：同一 `base` 下用 `plan.program` 增加原生对象、`plan.updates` 修改独立数值或可移动点坐标、`plan.styles` 同时设置基线与新对象。门禁允许声明的输出、声明的值与样式、样式传播，以及由更新对象触发的传递重算；拒绝删除、重命名、未声明新增、未声明字段变化和依赖对象变为未定义。`inspect --ggb` 摘要增加 `x`、`y`、`value` 与 `slider`，供模型在更新前读取当前状态。交付的 `diff.json` 记录 `mode:"modify"`、`added`、`allowed` 与 `changes`，preview 重载基线并重算同一门禁。真实浏览器三轮（增加对象、样式、坐标更新、数值更新）通过，见[设计 4.5](ggb-plugins-design.md#45-ggb-构造修改)。

- 增加无浏览器的请求 check、参数同副本往返核验及预览证据门禁，headless 预览可用 --once 自动收束；真实拖动提前诊断重叠点与同址固定点（`fixed:true`）并保留失败截图。采用 DSH 独立安装包进行主要端到端验收，见 [验证记录](../dsh/docs/archive/2026-10-18/dsh-primary-validation.md) 与 [求解稳定性 pilot](../dsh/docs/archive/2026-10-18/dsh-solve-stability-pilot.md)。

- examples 仅保留几何题；代数、函数、统计及椭圆／统计混合输入移至 tests/fixtures，保留原始内容和回归覆盖。

- Skill 补充两条编写规则：`Text` 定位点用大写开头标签或内联坐标（小写开头名字在该参数位不被解析为点对象），拖动初态避开与其它可见点（含固定点）同址。

- `check` 的表达式检查报错带出 requirement:index 与缺失的 subject 名；能力契约补充比较表达式（不包 `if`）、`ArePerpendicular` 判垂直、圆半径用 `radius` 谓词三条写法。DSH Desktop 的会话库 usage 路径已写入 [Desktop 验证约定](../dsh/docs/dsh-desktop-validation.md#4-日志契约与交回分析)。

- 命名有效性由固定引擎及实际输出判定；静态 check 保留协议语法与工具命名空间约束，不维护命令名黑名单。题干点名的图形仍必须画出并核验。测试夹具路径随 `examples/v2-cases` 移动同步修正。

- 样式新增 `filling`（0–1 填充不透明度），用于"填充图形"类要求；样式比较对 `filling` 用容差，其余字段仍精确比较。`examples/v2-cases` 新增两个用例：`general-horse.json`（翻折原理说明图）与 `dashed-blue-circle.json`（虚线圆 + 半透明蓝色填充）。

- 明确插件只分析题意与作图，不提供题目答案；宿主回复与可见产物遵循 [Skill 输出边界](../skills/ggb-construction/SKILL.md#分析与作图边界)，内部计算、证据和核验门禁保留。开发包安装验证见 [Codex 验证](../codex/docs/archive/2026-10-18/codex-v2-validation.md)，不代表公开发布包已更新。

- 支持由 Agent 选择中文或英文工作语言，最终预览跟随请求 locale。README.md 默认英文，README.zh-CN.md 提供中文；两种分发包携带双语入口和中文 INSTALL.md，其余文档保留中文。

- 优化构图运行：固定文本默认展示属性、保存重载字段差异与阶段计时；采样预加载下一份独立 applet，删除每次加载后丢弃的截图。Skill 在同一会话及未变化的安装副本内复用 doctor，数学核验和文件提交门禁保持不变。[性能验收](archive/2026-10-18/performance-validation.md)。
- 文档按用途分工：AGENTS 管工程构建与维护，README 管项目用途与用户用法，本文管变更，设计文档管需求与设计取舍；字段、安装和测试明细通过链接引用。
- 工作区已实现系统默认浏览器预览：先 headless 复核，再发布本地页面并等待加载确认；通过页面“结束预览”或取消释放服务。该改动尚未包含在下列 0.8.0 发布包中；这里不声明新增客户端验收已经完成。

## 0.8.0 — 双生态独立分发

- 分别生成 Codex ZIP 与 DSH npm TGZ，共享 Skill、编译 CLI、页面和数学核验管线。
- DSH 包自身携带资源，取消对 Codex 缓存或另一 checkout 的自动回退；Skill 注册和引用定位通过宿主接口完成。
- npm 会排除 pnpm-lock.yaml，因此 TGZ 保存同内容的 dependencies.lock，安装时还原；所有安装器 pnpm 调用忽略上层 workspace，防止使用 DSH profile 的依赖环境。
- 分别完成 Codex CLI 与 DSH 独立 headless profile 的安装、自动技能调用、新题交付及关页清理验证。该版本的可见预览使用专用 Google Chrome，与未发布的默认浏览器改动不同。
- 请求协议和 M6 交付格式保持不变。

[发布说明](releases/v0.8.0.md) · [双生态验收](archive/2026-10-18/dual-ecosystem-validation.md)

## 0.7.0 — 固定 runtime 覆盖记录

- 保存官方命令目录来源、日期和摘要，并关联跨域输入中的实际构造及检查调用；未实测项保持明确状态，不推断全部重载可用。
- 增加可重跑覆盖工具和客户端生成的椭圆／统计输入。
- 通过新 Codex 回合验证安装后自动选用 Skill 到 GGB 交付，独立 ZIP 运行及清理也完成验收。

[发布说明](releases/v0.7.0.md) · [M7 验收](archive/2026-10-18/m7-validation.md)

## 0.6.0 — 通用事实与交互扩展

- 原生执行使用异步接口，按需加载数学模块；CAS 只在实际使用时等待。
- 增加嵌套数值／布尔列表与矩阵、显式符号假设、多输出和参数采样证据；区分真实鼠标动作与原生参数赋值。
- 保留协议 2 请求，交付格式升级为 M6；旧交付须重新构造以补齐证据。

[发布说明](releases/v0.6.0.md) · [M6 验收](archive/2026-10-18/m6-validation.md)

## 早期里程碑（M1–M5）

| 阶段 | 重要变化 | 证据 |
| --- | --- | --- |
| M5 | 接入原生二维 Algebra／CAS 程序及表达式核验；修复独立数学定义比较、按需等待 CAS 和条件表达式结果判定 | [M5 验收](archive/2026-10-18/m5-validation.md) |
| M4 | 增加可安装插件和安装器；修复旧／部分 dist 导致源码安装跳过重建的问题 | [M4 验收](archive/2026-10-18/m4-validation.md) |
| M3 | 补齐 doctor、超时取消、错误清理和原子提交；保留原始错误优先级及提交后 warning 语义 | [M3 验收](archive/2026-10-18/m3-validation.md) |
| M2 | 将固定构造移为可组合输入，共用执行与核验接口 | [M2 验收](archive/2026-10-18/m2-validation.md) |
| M1 | 跑通三角形、中线、导出、真实重载及交互预览；随后保留为回归输入 | [M1 验收](archive/2026-10-18/m1-validation.md) |
