# examples/geometry-benchmark 用例验证报告

日期：2026-10-16。验证对象：[examples/geometry-benchmark](../examples/geometry-benchmark/) 的 10 份请求。代码基线：commit `e88a96f` 加工作区未提交改动（`src/browser.ts`、`src/cli.ts`、`src/delivery.ts`）；`dist` 构建时间 23:07，晚于上述源码的最后修改 23:03。插件版本 0.8.0。

本报告只做验证与原因分析，未修改用例、执行器或核验门禁。所有断言都有本轮新产生的证据，不引用历史结论代替。

## 0 结论

1. 10 题各跑 3 轮，共 30 次 `build`，全部通过构造、重载、交互样本和 headless 预览复核，**30/30 通过，0 失败**。
2. 每题首轮即通过；本轮没有出现需要修复的用例。这与[上一份基准报告](geometry-benchmark.md)记录的“首轮 4/10”并不矛盾：`examples` 保存的是当时已修复的版本，本次验证的是修复后的输入与更新后的执行器。
3. 上一份报告遗留的唯一未通过项——正多边形 3→12→3 参数往返——**现已通过**。根因是用例改用动态顶点列表表达边数，执行器同时新增了参数回退核验。
4. 历史 9 次失败全部定位为**请求编写问题**，不是数学构造或几何判定错误。按机制分为 6 类，见第 3 节；每类都给出了原始错误文本、命中代码位置和最终修复。

| 验证范围 | 数量 | 通过 | 失败 |
| --- | ---: | ---: | ---: |
| 主用例（10 题 × 3 轮） | 30 | 30 | 0 |
| 补充边界（04 直角、04 钝角、10 重合） | 3 | 3 | 0 |
| 正多边形 12→3 独立重载往返 | 2 步 | 2 | 0 |

## 1 环境与口径

| 项 | 值 |
| --- | --- |
| 提交 | `e88a96f1a57e7c006afc1e53bc554b75f0580e18` ＋ 未提交源码改动 |
| 平台 | macOS arm64（darwin） |
| Node.js | v26.5.1 |
| Chromium（Playwright） | 156.0.8078.4 |
| GeoGebra runtime | 5.4.932.1，sha256 `c139f3ed…96e` |
| 数值容差 | 1e-8（未放宽容差，未删条件） |
| 单步／构建上限 | operationMs 30000、buildMs 120000 |

`doctor` 在本轮执行一次：`smoke`、`casSmoke` 均通过，通道为 algebra 与 cas，命令白名单关闭。环境记录见 [environment.json](../output/geometry-benchmark-verify-20261016/environment.json)。

验证口径：

- 串行调用真实 CLI `node dist/src/cli.js build --request <case>`，每次都启动新的浏览器会话，不用客户端缓存或另一份 checkout。
- 每题连续 3 轮；每轮都经完整生产门禁：原生执行、构造观察、独立重载比对、交互采样（9 题真实鼠标拖动、08 题原生参数设置）与快照一致性。
- 交付后再执行生产 `openPreview` 的 headless 复核并截图，随后释放资源。
- 补充边界与往返实验单独执行，不混入 30 次主样本统计。

## 2 结果

### 2.1 主用例

CLI 为墙钟毫秒中位数，含进程启动与请求读取；预览就绪为 `openPreview` 调用到可复核的中位数。检查数为该轮交付核验结果的条数，含自动对象检查，不等同于自然语言条件数。

| 题目 | CLI 中位数 | 预览就绪中位数 | 检查数 | 对象数 | 交互样本 | 结果 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| [01 外接圆与外心](../examples/geometry-benchmark/01-circumcircle.json) | 2910 | 565 | 49 | 18 | 3 拖动 | 通过 |
| [02 内切圆与内心](../examples/geometry-benchmark/02-incircle.json) | 2910 | 557 | 51 | 18 | 3 拖动 | 通过 |
| [03 中线与重心](../examples/geometry-benchmark/03-centroid.json) | 3029 | 586 | 70 | 28 | 3 拖动 | 通过 |
| [04 欧拉线](../examples/geometry-benchmark/04-euler-line.json) | 2909 | 567 | 56 | 22 | 3 拖动 | 通过 |
| [05 圆心角与圆周角](../examples/geometry-benchmark/05-inscribed-angle.json) | 3031 | 606 | 51 | 15 | 3 拖动 | 通过 |
| [06 圆外点两切线](../examples/geometry-benchmark/06-tangents.json) | 2952 | 564 | 57 | 18 | 3 拖动 | 通过 |
| [07 相交弦定理](../examples/geometry-benchmark/07-intersecting-chords.json) | 2921 | 558 | 54 | 16 | 3 拖动 | 通过 |
| [08 滑块内接正多边形](../examples/geometry-benchmark/08-regular-polygon.json) | 2799 | 613 | 120 | 53 | 3 参数（含回退） | 通过 |
| [09 将军饮马最短路径](../examples/geometry-benchmark/09-shortest-path.json) | 2970 | 565 | 61 | 20 | 3 拖动 | 通过 |
| [10 弦中点轨迹](../examples/geometry-benchmark/10-midpoint-locus.json) | 2917 | 566 | 38 | 10 | 3 拖动 | 通过 |

30 次成功 `build` 的 CLI 墙钟合计 88252 ms。9 题的真实鼠标拖动每次约 320–340 ms；08 题的原生参数设置约 2–3 ms，参数回退核验另计约 25 ms，两者检验的行为不同，不能互相替代。

十份预览截图已合成[总览图](../output/geometry-benchmark-verify-20261016/contact-sheet.png)并逐张目视检查：十个图形均按题意渲染，标注与数值显示正常；08 题初始 n=3 显示“边数=3 边长=5.2 周长=15.59”。

### 2.2 补充边界

| 边界用例 | 内容 | 结果 |
| --- | --- | --- |
| [04-right](../output/geometry-benchmark-20261016/edge-inputs/04-right.json) | 欧拉线直角初态 | 构造、重载、3 拖动、预览复核全部通过 |
| [04-obtuse](../output/geometry-benchmark-20261016/edge-inputs/04-obtuse.json) | 欧拉线钝角初态 | 同上，通过 |
| [10-coincident](../output/geometry-benchmark-20261016/edge-inputs/10-coincident.json) | A、B 重合的弦中点轨迹 | 构造、重载、2 拖动（O、R）、预览复核全部通过；不声称能用鼠标区分重合的 A/B |
| [08 往返](../output/geometry-benchmark-verify-20261016/round-trip.json) | 独立重载会话中 n=12 → n=3 | 两步各 120 项检查全部通过，53 个对象全部有定义 |

往返实验的原始事实见 [round-trip.json](../output/geometry-benchmark-verify-20261016/round-trip.json) 与截图 [n=12](../output/geometry-benchmark-verify-20261016/edges/polygon-return-n12.png)、[n=3](../output/geometry-benchmark-verify-20261016/edges/polygon-return-n3.png)；原交付文件 `result.ggb` 摘要实验前后未变。

## 3 原因分析

### 3.1 本轮为什么 0 失败

`examples` 中的 10 份输入与历史归档的 `final-inputs` 有 9 份完全一致，说明它们是上一轮修复后的成品，本轮相当于对固化输入做回归。唯一不同的是 08 题（`5336c941…` → `a645cd54…`），它在上一轮报告之后又被重写，正是本次往返缺陷消失的直接原因（见 3.3）。

同时，本轮执行器比上一轮报告时更新（未提交改动集中在 `browser.ts`、`cli.ts`、`delivery.ts`）。新增的核对交互回退、拖动目标重叠诊断和结构性 `check` 命令没有使任何既有用例失败，说明用例与新门禁兼容。

### 3.2 历史 9 次失败的根因

数据来源：[归档 attempts.json](../output/geometry-benchmark-20261016/attempts.json)，每题失败的原始请求保留在对应 `attempt-N/request.json`。下表把“首次失败输入”与“通过输入”做了逐行对比，机制一列标注了命中的代码位置。

| 题／尝试 | 错误码 | 原始证据 | 机制 | 最终修复 |
| --- | --- | --- | --- | --- |
| 01／1 | execution_failed | `Incomplete native outputs: triangle: triangle,c,a,b` | 原生步骤创建的标签集合必须与 `outputs` 的集合完全一致，长度和成员都要求相等（`src/browser.ts:282`）；草稿完全没有声明 `outputs` | `triangle=Polygon(A,B,C)` 声明 `["triangle","a","b","c"]` |
| 01／2 | verification_unverified | `geometry:7 … Dependency references require semantic resolution: note` | `dependsOn` 需要沿依赖链解析定义；`note=Text("OA="+dA+…,(0,7))` 内联嵌套表达式与坐标，依赖状态为 ambiguous（`src/verify.ts:111`） | 拆成 `message` 表达式、`NotePos` 点、`note=Text(message,NotePos)` |
| 03／1 | verification_unverified | `geometry:6 … semantic resolution: ratioA` | 同类问题：`ratioA=Distance(A,G)/Distance(G,D)` 把函数调用嵌在比值里，依赖不可解析 | 先命名 `distAG`、`distGD`，再 `ratioA=distAG/distGD` |
| 05／1 | verification_unverified | `geometry:3`，表达式 `central-2inscribed`，观察 `type: angle, value: 0`，仍为 unverified | `expression` 检查只在观察类型为 `numeric` 时做数值比较（`src/verify.ts:187`）；角度相减的结果仍是 `angle` 类型 | `central/(1°)-2inscribed/(1°)`，把角度换算成数值，容差不变 |
| 08／1 | execution_failed | `Execution failed or output undefined: shape` | 声明的附属边标签 `a`、`b`、`c` 在该命令下并不存在（实际生成 `f`、`g`、`h`），`outputs.some(id => !isDefined(id))` 判为未定义（`src/browser.ts:281`） | 按运行时真实标签声明输出 |
| 08／2 | verification_unverified | `geometry:6 … semantic resolution: vertices` | `side=Distance(Vfirst,Vsecond)`，而 `Vfirst/Vsecond` 取自 `Element(Take(allVertices,1,n))` 这类局部绑定列表，依赖链不可解析 | `side=Distance(R,S)`，直接绑定相邻顶点 |
| 09／1 | execution_failed | `Execution failed or output undefined: l` | `l=y=0` 被解析成赋值／布尔式，没有创建命名为 `l` 的直线 | 改用原生命名方程 `l: y=0` |
| 10／1 | verification_failed | `page.waitForFunction: Timeout 30000ms exceeded`（最后一次拖动约 30339 ms） | 拖动目标 `A` 的初值 `[3,0]` 与可移动辅助半径点 `R=(3,0)` 完全重合，真实鼠标按下命中的不是目标点，坐标不变导致等待超时 | 辅助点改为 `R=(0,-3)`，消除重叠 |
| 10／2 | invalid_input | `Requirement source is not in the input` | 每条 `requirement.source` 必须是 `prompt` 的字面子串（`src/schema.ts:130`）；本轮 prompt 已改为 `R=(0,-3)`，source 仍写 `R=(3,0)` | 同步 source 文案 |

归因准则：以上 9 次都只改动了请求本身（程序、检查或文案），没有放宽容差、没有删除必要条件、没有修改执行器，改后即通过。因此归类为**请求编写错误**，而不是数学引擎或几何判定错误。反过来，如果失败需要靠放宽门禁才能通过，就应归因于实现或题型边界，这 9 次都不属于该情形。

按机制归类：原生多输出／标签声明 2 次（01、08）；依赖不可解析 3 次（01、03、08）；角度单位与类型 1 次（05）；原生语法 1 次（09）；拖动目标重合 1 次（10）；请求自洽 1 次（10）。

其中两类已经能在编写阶段提前发现，不必等 30 秒超时或跑到核验：

- 拖动目标重叠：当前 `dragPoint` 在按下前会枚举与该点屏幕距离 ≤10 px 的其它可移动可见点，命中即报 `Ambiguous drag target: overlapping movable points` 并附带诊断（`src/browser.ts:387`）。10 题历史上的重合初值会在此被立即拦下。
- 结构与自洽：`cli.js check --request <file>` 可先做 parseRequest 加 compile，提前暴露 source 不含于 prompt、引用未声明对象等问题（`src/cli.ts`）。

### 3.3 正多边形参数往返：上轮失败，本轮通过

上一份报告记录“12 边时通过；回到 3 边时留下 18 个隐藏且未定义的附属对象”，判定为未验收项。本轮用当前构建复现该场景，结论已经不同。

| 项 | 上一轮（`5336c941…`） | 本轮（`a645cd54…`） |
| --- | --- | --- |
| 边数表达 | `shape=Polygon(R,S,n)`，创建时刻固定顶点与标签 | `vertices=Take(allVertices,1,n)` ＋ `closedVertices=Append(…)` ＋ `shape=Polyline(closedVertices)` |
| n=12 时 | 12 条边正常 | 12 边形，53 个对象全部有定义，120 项检查通过 |
| 回到 n=3 | 保留 9 个旧顶点和 9 条旧边，共 18 个对象 undefined，`objects_defined` 拒绝 | 三角形，仍是 53 个对象、0 个 undefined，120 项检查通过 |
| 原始文件摘要 | 未变 | 未变 |

原因分两层。第一层是用例：旧写法把边数编码在 `Polygon(R,S,n)` 的创建结果里，收缩时 GeoGebra 只更新有效部分，旧的顶点和边留下但不再定义；新的写法只在原生列表上做 `Take`／`Append`，几何形状由折线重新读取顶点列表，边数变化不再产生残留对象。第二层是执行器：参数样本现在强制做回退核验，`interact` 改值后必须恢复到原值并对回退状态再做一次同样条件的核验与快照比对（实现 `src/delivery.ts:184`、调用 `:283`；报告层要求保留回退证据 `:441`）。08 题第 3 个样本把 n 设为 12，回退即回到 n=3，所以主样本本身已覆盖 12→3；本轮第 2.2 节的实验另用独立重载会话再验证一次，两步均为 120 项检查、0 失败。

需要说明的是，主样本的 3 个参数点为 4、6、12，加上每次回退到初值 3，仍未穷举 3 到 12 的每一个整数。

## 4 残留风险与未覆盖项

| 项 | 现状 | 边界 |
| --- | --- | --- |
| 采样有限 | 每题 3 个交互样本、3 轮重复 | 不能证明任意拖动位置与任意参数值都成立 |
| 08 参数域 | 验证了 4、6、12 与回退到 3，另有 12→3 独立复现 | 3..12 逐点未穷举 |
| 10 重合情形 | A、B 重合时中点与轨迹仍定义 | 不声称鼠标可区分重合的 A/B |
| 04 退化情形 | 锐角、直角、钝角初态各验证一次 | 等边三角形欧拉线不唯一未验收 |
| 05 分支 | 只覆盖 C 在不含 A、B 的那段弧上 | 跨弧分支未验收 |
| 06 退化 | P 在圆外 | 切点进入圆内未验收 |
| 图形判定 | 十份截图已目视检查 | 目视是观察证据，不替代数学判定；预览只验证可加载与渲染，未做像素级对比 |
| 环境 | 固定 runtime 5.4.932.1 与 Chromium 156 | 结论不自动外推到其它 runtime 或浏览器版本 |
| 与历史数据的可比性 | 本轮为回归验证，输入是已修复版本 | 本轮通过率不能当作新题的首次编写成功率 |

## 5 证据与复现

证据目录：[output/geometry-benchmark-verify-20261016](../output/geometry-benchmark-verify-20261016/)（455 个文件，89 MB）。按仓库规则 `output` 不进入 Git；已另存整体证据包 [geometry-benchmark-verify-20261016-evidence.zip](../output/geometry-benchmark-verify-20261016-evidence.zip)（10526731 字节，sha256 `400bfcd8f81d16362c4637ef158b10ec9bead5b179f9a5f5592c50a2c6f0c699`）与同名 `.sha256` 文件。

| 路径 | 内容 |
| --- | --- |
| [verify-results.json](../output/geometry-benchmark-verify-20261016/verify-results.json) | 30 次主用例运行的逐次结果：耗时、门禁状态、检查数、交付文件摘要 |
| [three-pass.log](../output/geometry-benchmark-verify-20261016/three-pass.log) | 30 次运行的原始 CLI 输出 |
| [verify-results-single-pass.json](../output/geometry-benchmark-verify-20261016/verify-results-single-pass.json) | 先行单轮全量运行（10/10 通过），与三轮结果对照；两次合计 40 次 build 无失败 |
| [extras-results.json](../output/geometry-benchmark-verify-20261016/extras-results.json) | 3 个补充边界用例与往返实验汇总 |
| [round-trip.json](../output/geometry-benchmark-verify-20261016/round-trip.json) | 12→3 往返的逐步事实 |
| `<题目>/repeat-N/` | 每轮的 request.json、cli.json 与 `runs/<run>/` 中的 run.json、交付（result.ggb、verification.json、manifest.json、preview.png） |
| `<题目>/repeat-N/preview-check.png` | 生产 openPreview 的 headless 复核截图 |

复现步骤：

```sh
pnpm build
node dist/src/cli.js doctor
node output/geometry-benchmark-verify-20261016/verify-cases.mjs 3
node output/geometry-benchmark-verify-20261016/verify-extras.mjs
```

`verify-cases.mjs` 串行调用真实 CLI 并在每题每轮后写入检查点；`verify-extras.mjs` 需要 `verify-results.json` 中已有 08 题的通过交付。两者都在 `output` 下运行，不修改用例与生产代码。脚本依赖仓库 runtime 与匹配的 Chromium，首次准备见 [AGENTS.md](../AGENTS.md)。

## 6 与前一份报告的关系

[常见二维几何运行对比](geometry-benchmark.md)记录的是 2026-10-16 的编写与性能测量（代码 `5e167d9`，39 次尝试／30 次逻辑运行），其历史计时与阶段数据仍然有效，作为历史证据不受本次验证影响。

需要以本报告更新的一条结论是：该文第 5 节“正多边形 3→12→3 连续变化”记为失败。当前用例与执行器下该场景已通过，见本报告 3.3。其余未覆盖项（等边三角形欧拉线、圆周角跨弧、切线点进入圆内、任意次数往返、全参数域）结论不变。

本文采用与仓库既有文档一致的中文技术写作方式，不声明合规任何外部写作标准。
