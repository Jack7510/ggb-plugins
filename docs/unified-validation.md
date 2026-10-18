# 统一事实与核验门禁验证

日期：2026-10-17。本文记录未发布工作区的统一修复。版本字段仍为 0.8.0，不代表公开发布资产已更新。历史案例记录保留在 [Codex v2 验证](../codex/docs/archive/2026-10-18/codex-v2-validation.md)。

## 根因与统一处理

| 根因 | 当前实现 | 反例与通过条件 |
| --- | --- | --- |
| 命令字符串被当作对象身份和修改权限 | 隔离 applet 重载同一 GGB，逐对象删除并记录真实消失集合；完整集合才能形成传递依赖 | P 与 P' 不能混同；局部绑定不冒充全局依赖 |
| 数学依赖被当作外观归属 | 固定引擎 XML 输出组确认 Polygon 边的描边归属；只允许所属描边字段同值传播 | 隐藏 A 不能授权隐藏数学后代 B；颜色错误、填充和可见性传播仍拒绝 |
| native 与旧原语的交互证据口径不同 | 正式提交与 preview 共用 requireSampleCoverage；具有可操控输入的 sampled 数学关系须有相关交互目标，固定约束仍逐样本检查 | 拖动 U 不能代替 A 与中点 M 的联动证据 |
| 命令名单试图判定语义或独立证明 | 移除“同义反复”检测；requirement 可记录 purpose；命名策略单独保护保留字和内置名称 | purpose 不改变任何门禁；命名限制不能替代数学核验 |
| viewer 自行解释部分 LaTeX | 标题与 tooltip 按原文显示，标题换行，使用 textContent | 转义美元、未知命令和 HTML 都保持文字，不改题意 |

facts 是同一包内的纯事实与授权规则模块，不是新的服务或数学执行器。browser 负责原生探针与资源释放；verify、修改白名单与交付覆盖消费同一份引擎事实。没有题型路由、命令执行包装或生产故障开关。

## 门禁与资源不变量

- 原画布不执行依赖删除探针；删除发生在隔离副本。探针完成后核对原画布 XML 未改变，finally 关闭副本。
- 依赖证据覆盖全部实际标签。目标缺失、删除无效或对象集合不完整时，不能从字符串补猜权限。
- 数学依赖与外观归属分别记录。重新计算的几何字段继续按白名单核验，样式变化不能借用该白名单。
- 交互关系允许保持不变量；相关性由对象身份和依赖确定，不能靠“某个点确实移动”证明覆盖。
- 固定容差、全部对象定义有效性、真实鼠标采样、参数往返、导出重载与关闭资源后提交均保留。ZIP 标识与大小检查统一由 exportGgb 执行，交付层不再重复同一检查；依赖副本和正式交付使用相同边界与错误码。
- 依赖证据仅在同一浏览器上下文、原画布 XML 逐字节一致时复用。缓存只持有最近一份图，不保存数学值、报告或 passed 判定，失败图不复用。

## 证据目的与兼容性

requirement.purpose 可选 construction、constraint、interaction，未提供时为 unspecified。该字段只记录作者的证据目的，不认证独立性，也不豁免采样覆盖。CLI warnings 与报告 verificationNotes 说明执行断言的边界，不按命令名称推导证明。

请求协议仍为 2，原请求无需增加 purpose 才能执行。事实中的 inputs 改为引擎确认的传递依赖，并增加外观归属字段。旧交付缺少这些事实时不能直接当作新版本验收结果，须重新 build。字段与操作契约见 [能力契约](../skills/ggb-construction/references/capabilities.md)。

标题现在保留原始 LaTeX 字面文本，不承诺完整数学排版。该选择避免继续扩展自制语法子集；长标题仍完整换行。更成熟的离线排版器可以作为独立展示需求评估，不能借此改写原始题目。

## 回归方法与结果

首次回归保留在本机日志中：新采样覆盖揭示了旧测试删除圆上点鼠标样本后仍宣称该关系已采样的问题。修复方式是保留完整原题测试，另建不含该几何条件的纯代数参数题作为正例；缺少几何样本的原请求单独作为拒绝反例。没有删掉原题条件或放宽容差。

依赖 XML 的早期实现仍无法完整区分局部变量与全局引用，随后改为原生隔离探针；未将该中间版本用于最终安装验收。

类型检查、构建与最终 87 项离线回归通过。完整浏览器组覆盖 75 项统计节点，唯一失败为局部绑定反例仍要求旧的 verification_unverified 错误码；其子测试及父测试各计一次失败，其余 73 项统计节点通过。原生证据现在能确定反驳该依赖，断言改为严格要求 verification_failed 后，相关 24 项复跑全部通过；不是允许两种结果，也没有放宽核验。

故障、启动及事实门禁组合回归共 58 项通过。控制能力判定修正后，87 项离线检查及 3 项事实浏览器反例再次通过。原生失败诊断整理后的 14 项回归通过。各次日志存在测试交集，不累加为独立测试数量。

安装首轮 9 题通过 8 题：双曲线题的固定原点约束被错误要求参与交互。根因是覆盖规则没有区分实际可操控输入与固定量。统一改为依据引擎控制能力判定；原点约束仍保持 sampled，原请求、条件及容差均未修改。首轮失败记录保留在 installed-results.json。

最终安装副本 11 例全部通过 check、build 和 headless preview --once，包括 7 个 v2 案例、椭圆与双曲线案例、多边形改色和带撇号对象续构。最终一轮无请求修复；这不覆盖前述首轮失败。每例保留 request、run、verification、GGB、截图及命令日志。

| 案例 | build / ms | 预览复核 / ms | 历史 build / ms |
| --- | ---: | ---: | ---: |
| bisector.json | 3913 | 1106 | — |
| circle.json | 4040 | 1115 | — |
| dashed-blue-circle.json | 3491 | 1097 | — |
| ellipse-focal-chord.json | 6833 | 1294 | 2371 |
| general-horse.json | 8244 | 1447 | 2949 |
| hyperbola-asymptote-rectangle.json | 4369 | 1319 | 1978 |
| parabola.json | 4857 | 1271 | 2014 |
| polygon-edit.json | 2649 | 2063 | — |
| primed-modify.json | 2649 | 2090 | — |
| transfer.json | 4402 | 1193 | — |
| triangle.json | 4317 | 1183 | — |

历史四例取自展示修复验收；逐一核对 program、requirements 与 interactions 完全相同，结果见 comparison-final.json。当前 build 约为历史的 2.2～2.9 倍，主要新增成本为隔离 applet 的依赖探测；单次对照不是稳定性能基准，也没有计入模型耗时。

## 性能与范围

原生依赖探针会增加运行成本。日志中的 snapshotMs 包含依赖采集，不能将该增量误算为模型推理时间。当前复用只针对逐字节相同的 XML，不跨宿主或构造借用证据。性能数据与新增门禁成本应同时报告，不能宣称本轮是提速优化。

本轮工程处理也有明显效率问题：实现未及时冻结，调整后重复核对过多；早期安装案例准备还错误猜测了基线对象名。后续应先依据现有夹具固定输入和验收范围，成批完成实现与反例，再运行受影响检查；最终安装只做一次案例验收。门禁失败仍须保留证据并修复，不能用减少必要核验来缩短时间。

引擎依赖说明对象在当前原生构造中的关系，不构成一般数学证明。宿主仍负责题意、分支、证据目的及独立推导的完整性。有限交互样本不是全域证明。

## 证据目录

本机证据位于 [output/unified-validation](../output/unified-validation/)，不提交生成物。源码设计见 [统一事实设计](ggb-plugins-design.md#11-统一事实与证据边界)。

| 文件 | 内容 |
| --- | --- |
| baseline.patch | 任务开始时已有改动的快照；未跟踪 talks/ 未修改 |
| offline-first.log、offline-second.log、browser-first.log | 中间实现失败及归因依据 |
| offline-capability-final.log | 最终 87 项离线回归 |
| browser-second.log | 完整浏览器覆盖与旧错误码断言失败 |
| browser-targeted-final.log | 修正错误码断言及追加局部绑定反例后的 24 项通过 |
| regressions/ | 无关采样、撇号身份、缺失样本及成功复跑证据 |
| gate-final.log、capability-browser-final.log | 故障、启动与事实门禁回归 |
| provenance-corrected.json、setup-corrected.log | 最终安装文件一致性与启动检查 |
| installed-results.json、installed-final-results.json | 首轮失败与最终安装副本案例复跑 |

最终 Codex 安装包 SHA-256 为 `27d822965bee1f089833f9b17a19200b032416e6fd5f21aa3504b279a1931c5e`。安装来源为本机 ggb-plugins-unified-r2-20261017 marketplace；19 个关键文件与当前构建逐字节一致，doctor、smoke 和 CAS smoke 通过。仅保留该安装自身已验摘要的 runtime，未借用另一客户端或 checkout。源码基线为 `97bd7cd9d5dfee9eb7a606513f8ebd54b12e7eea`，原有未跟踪的 talks/ 未改动。

本轮验证显式调用已安装插件 CLI；未验收新 Codex 会话的自主发现，也未执行 DSH 安装或公开发布。

## 命名校验修正复验

2026-10-17 后续修正：此前整体移除 reservedNames 过度依赖执行阶段，丢失了必要的命名前置检查。当前 src/names.ts 区分官方禁用标签与插件内置名称保护；schema 对所有新建步骤 id 和显式 outputs 调用同一策略，续构新增对象也不例外。已有对象身份不受新建规则追溯限制。命名契约及依据见 [能力契约](../skills/ggb-construction/references/capabilities.md#命名规则)。

反例覆盖 ln、sin、坐标轴名、特殊函数名、常量、工具命名空间及命令名遮蔽，并遍历已有官方目录中的 502 个命令名。freePoint、command、Algebra、CAS、显式多输出及续构声明均有前置拒绝回归。普通名称、名称后缀、下标和已有基线标签保留正例。

仅运行受影响的必要检查：build（包含 TypeScript 检查）、schema／modify／preflight 共 45 项离线检查，以及 2 项真实 headless 浏览器回归，全部通过。浏览器正例使用 Circle 命令并完成重载交付；反例以合法声明名包裹 Circle=1、sin=1，确认 source 不能绕过实际输出身份门禁且不会产生正式 delivery。引擎执行实现与数学容差未修改。

本次证据保留在 [output/naming-validation](../output/naming-validation/)：build.log、unit.log、browser.log，以及每次浏览器运行的诊断、截图或正式交付。git diff --check 通过。没有重复运行全量浏览器组或 11 例验收，也没有重新打包、更新安装缓存；前述安装包摘要只对应此前统一修复，不能作为本次命名修正的安装证据。已有未提交改动保留。
