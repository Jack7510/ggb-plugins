# 重要修改记录

只记录影响用途、行为、兼容性或维护方式的重要变化。这里说明“改了什么”；需求依据见[设计文档](ggb-plugins-design.md)，操作方法见 [README](../README.md)，具体测试与产物见对应验收记录。

## 未发布

- 统一对象身份、引擎依赖证据与外观归属；native／旧原语共用采样覆盖门禁。移除命令式“同义反复”检测和自制 LaTeX 标题转换，证据目的仅作记录。新建对象集中校验官方禁用标签和内置名称遮蔽，所有 id 与显式 outputs 共用，保留引擎核验。核验门禁与反例复验见 [统一门禁验证](unified-validation.md)。

- 修复代码审查发现的六处边界问题：等长谓词只接受真实线段；编辑和续构的初次核验未通过时禁止导出；ZIP 解压在分配内存时限制单条目与剩余总量；外部 GGB 和实际快照拒绝 XML 三维类型，防止 API 类型别名隐藏维度；条件来源不再接受 Agent 的提问；允许沿已声明更新依赖重算圆锥系数。三种构图模式共用导出、重载与原子提交，提交和预览共用证据复验。新增离线、真实 applet 与故障回归，保留不相关字段变化的拒绝和原文件只读规则。

- 将军饮马案例的可见文字改为构图和观察提示，保留全部数学检查与拖动样本。viewer 保留题干原文并支持长标题换行，不再自制 LaTeX 解释。Codex 安装副本复跑结果见 [验证报告](codex-v2-validation.md)。

- 新增 `capabilities.json` 与 `skills/ggb-construction/worker.md`：插件是 Worker 提示词与能力契约的唯一来源。`capabilities.json` 由 `src/schema.ts` 和 `worker.md` 生成，包含请求协议版本、`pointOn` 支持的圆锥曲线类型、检查谓词、限额与 `workerSkillSha256`；ggb-agent Worker 启动时校验该哈希与 profile 版本，不匹配即拒绝启动。ggb-dsh 不再保存第二份完整 Skill。
- `check` 与交付报告明确执行证据的边界；当前使用 purpose 与 verificationNotes 记录证据目的，不按命令名认证独立性，见 [能力契约](../skills/ggb-construction/references/capabilities.md#通用核验)。
- `pointOn` 支持圆锥曲线（椭圆、双曲线、抛物线）：从归档的齐次矩阵取隐式方程，按点到曲线的距离核验；此前只支持直线与圆，椭圆上取点只能用参数表达式绕开。另把「非 expression 检查出现 expression 字段」和「expected 类型错误」的报错改成点名具体字段与实际值。
- Skill 与能力契约增加期望值规则：坐标、距离、面积、角度等 `expected` 必须按题目条件独立算出，不从失败证据、`inspect` 结果或上一轮观测里抄数值；失败后只改证据指出的那一项。评测中「将军饮马」连续三次构建都因自选期望值出错而耗尽构建次数。
- 执行失败区分「引擎未创建该标签」与「标签已创建但未定义」：`Execution failed or output undefined: hit; actual labels: ...; missing: hit (undefined)`，不再把未定义的几何结果（如不相交的圆求交点）笼统报成缺失。
- 诊断报错点名具体对象与检查：未知字段直接给出键名，顶层误放的 `interactions`／`styles`／`requirements`／`view`／`display` 提示放入 `plan`；subject 数量错误带需求 id 与谓词（`Check "m" midpoint: expected 3 subjects, got 2`）；谓词类型错误给出期望与实际类型（`Expected a line: s (segment)`）。需求 id 允许 `-` 与 `.`，因为它只作为证据键。
- `build` 执行失败时报出引擎实际返回的标签与缺失的输出名（`actual labels` / `missing`）；输出是否定义改为执行后判定，结构化步骤不再把尚未创建的输出误报为缺失。
- `check` 允许原生步骤的 `outputs` 声明 GeoGebra 自动生成、看起来像保留名的实际标签（例如多边形自动边 `i`）；步骤 `id` 仍拒绝保留名。此前多边形等命令无法完整声明自动输出标签。

- 新增已有 GGB 的显示属性编辑：`inspect --ggb` 列出对象清单与摘要，请求用 `base` + `edits` 声明颜色、线宽、线型、填充、可见性与标签可见性。交付额外保存 `base.ggb` 和 `diff.json`；门禁依次检查摘要、归档与脚本、对象可解释、逐字段读回、差异白名单与重载一致，preview 会重载内嵌基线并重算差异；多边形颜色/描边到其边对象的同步作为受控传播计入 `changes`，其它未声明差异仍失败。`edits` 本身仍只改显示属性；增删对象与受控改值使用下一条的修改模式。删除、重命名、改视图、脚本、自定义工具、图片／按钮／三维材料不在支持范围，见[设计 4.4](ggb-plugins-design.md#44-ggb-属性编辑p0) 与[能力契约](../skills/ggb-construction/references/capabilities.md#编辑已有-ggb-p0)。已用 10 对象、22 对象（外部 5.4.916.2 文件，含撇号与希腊字母标签）与 30 对象基线完成真实浏览器编辑与重载验收；归档 XML 实体在读取时解码，非 ASCII 标签可直接作为编辑目标。

- 新增已有 GGB 的构造修改：同一 `base` 下用 `plan.program` 增加原生对象、`plan.updates` 修改独立数值或可移动点坐标、`plan.styles` 同时设置基线与新对象。门禁允许声明的输出、声明的值与样式、样式传播，以及由更新对象触发的传递重算；拒绝删除、重命名、未声明新增、未声明字段变化和依赖对象变为未定义。`inspect --ggb` 摘要增加 `x`、`y`、`value` 与 `slider`，供模型在更新前读取当前状态。交付的 `diff.json` 记录 `mode:"modify"`、`added`、`allowed` 与 `changes`，preview 重载基线并重算同一门禁。真实浏览器三轮（增加对象、样式、坐标更新、数值更新）通过，见[设计 4.5](ggb-plugins-design.md#45-ggb-构造修改)。

- 增加无浏览器的请求 check、参数同副本往返核验及预览证据门禁，headless 预览可用 --once 自动收束；真实拖动提前诊断重叠点与同址固定点（`fixed:true`）并保留失败截图。采用 DSH 独立安装包进行主要端到端验收，见 [验证记录](dsh-primary-validation.md) 与 [求解稳定性 pilot](dsh-solve-stability-pilot.md)。

- examples 仅保留几何题；代数、函数、统计及椭圆／统计混合输入移至 tests/fixtures，保留原始内容和回归覆盖。

- Skill 补充两条编写规则：`Text` 定位点用大写开头标签或内联坐标（小写开头名字在该参数位不被解析为点对象），拖动初态避开与其它可见点（含固定点）同址。

- `check` 的表达式检查报错带出 requirement:index 与缺失的 subject 名；能力契约补充比较表达式（不包 `if`）、`ArePerpendicular` 判垂直、圆半径用 `radius` 谓词三条写法。DSH Desktop 的会话库 usage 路径已写入 [Desktop 验证约定](dsh-desktop-validation.md#4-日志契约与交回分析)。

- 命名有效性由固定引擎及实际输出判定；静态 check 保留协议语法与工具命名空间约束，不维护命令名黑名单。题干点名的图形仍必须画出并核验。测试夹具路径随 `examples/v2-cases` 移动同步修正。

- 样式新增 `filling`（0–1 填充不透明度），用于"填充图形"类要求；样式比较对 `filling` 用容差，其余字段仍精确比较。`examples/v2-cases` 新增两个用例：`general-horse.json`（翻折原理说明图）与 `dashed-blue-circle.json`（虚线圆 + 半透明蓝色填充）。

- 明确插件只分析题意与作图，不提供题目答案；宿主回复与可见产物遵循 [Skill 输出边界](../skills/ggb-construction/SKILL.md#分析与作图边界)，内部计算、证据和核验门禁保留。开发包安装验证见 [Codex 验证](codex-v2-validation.md)，不代表公开发布包已更新。

- 支持由 Agent 选择中文或英文工作语言，最终预览跟随请求 locale。README.md 默认英文，README.zh-CN.md 提供中文；两种分发包携带双语入口和中文 INSTALL.md，其余文档保留中文。

- 优化构图运行：固定文本默认展示属性、保存重载字段差异与阶段计时；采样预加载下一份独立 applet，删除每次加载后丢弃的截图。Skill 在同一会话及未变化的安装副本内复用 doctor，数学核验和文件提交门禁保持不变。[性能验收](performance-validation.md)。
- 文档按用途分工：AGENTS 管工程构建与维护，README 管项目用途与用户用法，本文管变更，设计文档管需求与设计取舍；字段、安装和测试明细通过链接引用。
- 工作区已实现系统默认浏览器预览：先 headless 复核，再发布本地页面并等待加载确认；通过页面“结束预览”或取消释放服务。该改动尚未包含在下列 0.8.0 发布包中；这里不声明新增客户端验收已经完成。

## 0.8.0 — 双生态独立分发

- 分别生成 Codex ZIP 与 DSH npm TGZ，共享 Skill、编译 CLI、页面和数学核验管线。
- DSH 包自身携带资源，取消对 Codex 缓存或另一 checkout 的自动回退；Skill 注册和引用定位通过宿主接口完成。
- npm 会排除 pnpm-lock.yaml，因此 TGZ 保存同内容的 dependencies.lock，安装时还原；所有安装器 pnpm 调用忽略上层 workspace，防止使用 DSH profile 的依赖环境。
- 分别完成 Codex CLI 与 DSH 独立 headless profile 的安装、自动技能调用、新题交付及关页清理验证。该版本的可见预览使用专用 Google Chrome，与未发布的默认浏览器改动不同。
- 请求协议和 M6 交付格式保持不变。

[发布说明](releases/v0.8.0.md) · [双生态验收](dual-ecosystem-validation.md)

## 0.7.0 — 固定 runtime 覆盖记录

- 保存官方命令目录来源、日期和摘要，并关联跨域输入中的实际构造及检查调用；未实测项保持明确状态，不推断全部重载可用。
- 增加可重跑覆盖工具和客户端生成的椭圆／统计输入。
- 通过新 Codex 回合验证安装后自动选用 Skill 到 GGB 交付，独立 ZIP 运行及清理也完成验收。

[发布说明](releases/v0.7.0.md) · [M7 验收](m7-validation.md)

## 0.6.0 — 通用事实与交互扩展

- 原生执行使用异步接口，按需加载数学模块；CAS 只在实际使用时等待。
- 增加嵌套数值／布尔列表与矩阵、显式符号假设、多输出和参数采样证据；区分真实鼠标动作与原生参数赋值。
- 保留协议 2 请求，交付格式升级为 M6；旧交付须重新构造以补齐证据。

[发布说明](releases/v0.6.0.md) · [M6 验收](m6-validation.md)

## 早期里程碑（M1–M5）

| 阶段 | 重要变化 | 证据 |
| --- | --- | --- |
| M5 | 接入原生二维 Algebra／CAS 程序及表达式核验；修复独立数学定义比较、按需等待 CAS 和条件表达式结果判定 | [M5 验收](m5-validation.md) |
| M4 | 增加可安装插件和安装器；修复旧／部分 dist 导致源码安装跳过重建的问题 | [M4 验收](m4-validation.md) |
| M3 | 补齐 doctor、超时取消、错误清理和原子提交；保留原始错误优先级及提交后 warning 语义 | [M3 验收](m3-validation.md) |
| M2 | 将固定构造移为可组合输入，共用执行与核验接口 | [M2 验收](m2-validation.md) |
| M1 | 跑通三角形、中线、导出、真实重载及交互预览；随后保留为回归输入 | [M1 验收](m1-validation.md) |
