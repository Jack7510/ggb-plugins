# DSH 端到端求解稳定性 pilot 报告（4 题 × 1 轮）

日期：2026-10-16/17。目的：用 `examples/geometry-benchmark` 的**题干**测「DSH 已安装插件把题解出来」的稳定性，而不是重放固定请求。本轮 4 题各 1 个全新宿主会话，共 4 次会话、0 次复用。

## 0 结论

| 指标 | 结果 |
| --- | --- |
| 交付率（生产门禁全过） | **3/4 = 75%**（01、05、10 通过；08 未交付） |
| 首次 build 即通过 | **1/4 = 25%**（仅 05） |
| 修复后交付 | 01、10 各 1 次修复后通过；08 三次 build 全部失败 |
| 失败总数 | 4 次（01 ×1、08 ×3、10 ×1，其中 10 的失败被 1 次修复消化） |
| 成本 | 7.79 M token（输入 147 k、输出 268 k、cacheRead 7.37 M）；墙钟合计 1521 s（约 25 min） |

三个失败/修复点全部是**会话自查请求的编写问题**，门禁判定正确：01 漏声明 Polygon 附属标签、08 用了 GeoGebra 无法解析的小写开头点标签作 `Text` 定位点、10 的拖动目标与一个固定辅助点重合。没有任何一次是插件放宽容差、误判或数学引擎错误。

## 1 口径与版本

| 项 | 值 |
| --- | --- |
| 被测包 | `output/plugin/ggb-plugin-ySrPCk/ggb-plugins-dsh-0.8.0.tgz`，sha256 `db6f321d…decc` |
| 安装位置 | `~/.dsh/profiles/ggb-plugins-validation/node_modules/@local/ggb-plugins-dsh` |
| 包内版本核对 | `dist/src/delivery.js`、`SKILL.md`、`references/capabilities.md` 与工作区逐字节一致（[reinstall.json](../output/dsh-stability-prep/reinstall-pilot.json)、[doctor-after-reinstall.json](../output/dsh-stability-prep/doctor-after-reinstall-pilot.json)） |
| 安装自检 | doctor `ok:true`，`smoke`、`casSmoke` 通过 |
| 题干预 | 唯一来源 `examples/geometry-benchmark/*.json` 的 `prompt` 字段（70–124 字），`plan` 不读不传；逐题摘要见 [provenance.json](../output/dsh-stability-pilot/provenance.json) |
| 宿主 | `dsh 0.2.0-rc.2 --profile ggb-plugins-validation`，每题新会话、工作目录在仓库外 `/private/tmp` 且初始为空 |
| 凭据 | 复用 DSH 自身的 `DEEPSEEK_API_KEY`（从运行中的应用进程环境注入子进程），未写入任何文件 |
| 门禁 | 与生产一致：`check` 预检、构造、独立重载、交互样本、参数往返、headless 预览复核；容差 1e-8 未放宽 |

## 2 逐题结果

`builds` 为会话内实际 build 次数；`check` 为该会话的结构预检调用次数（括号内为预检失败次数）；样本与检查数来自外层对**实际交付**重跑生产 `openPreview` 的复核。

| 题 | 交付 | 首次 build | build 次数 | run 结果 | 样本 | 参数往返 | 检查数 | 墙钟 | token |
| --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 01 外接圆与外心 | 是 | 否 | 2 | 失败→交付 | 3 | 0 | 104 | 224 s | 1.73 M |
| 05 圆心角与圆周角 | 是 | **是** | 1 | 交付 | 4 | 3 | 45 | 480 s | 2.27 M |
| 08 滑块内接正多边形 | **否** | 否 | 3 | 3 次失败 | — | — | — | 507 s | 1.79 M |
| 10 弦中点轨迹 | 是 | 否 | 2 | 失败→交付 | 3 | 0 | 56 | 311 s | 2.01 M |

三次成功交付的 `result.ggb` sha256：01 `c34f8984…`、05 `b166a8c2…`、10 `5dccc9ce…`。

成本量级：4 次会话平均 1.95 M token、380 s。按此外推，10 题 × 3 轮（30 会话）约 **58 M token、3.2 h**（外推，非实测）。

## 3 失败归因

### 3.1 01：Polygon 附属标签未声明（工具正确拦截，1 次修复）

```
Execution failed: Incomplete native outputs: tri: tri,c,a,b
```

会话把三角形写成 `tri=Polygon(A,B,C)` 却没有声明 GeoGebra 自动创建的边标签（实际返回 `tri,c,a,b`）。规则在包内 `capabilities.md` 已有（"必须完整匹配原生返回标签"），仍被遗漏；`check` 结构预检不覆盖原生命令的真实返回标签，因此只能由 build 拦截。修复方式即补全 `outputs`，第二次 build 交付。

### 3.2 08：`Text` 定位点用了小写开头的标签（工具正确拦截，3 次全败）

三次 build 分别失败于 `Execution failed or output undefined: tN`、`: tNl`、`: tN`。会话本身用对了可变数量构造模板：

```
allPts=Sequence((x(O)+r*cos(2*pi*(k-1)/n), y(O)+r*sin(2*pi*(k-1)/n)), k, 1, 12)
active=Take(allPts,1,n) → poly=Polygon(active) → side=… → peri=…
```

但三次都把文字锚点命名为小写开头的点（`aN`、`aNl`、`bN`、`pN`）并写成 `tN=Text("边数 n = " + n, aN)`。**本地零模型成本复现**（[probe/](../output/dsh-stability-pilot/probe/)，13 个变体）把触发条件收窄为一条：

| 变体 | 程序 | 结果 |
| --- | --- | --- |
| M3 | `aN=(1,2)`；`tN=Text("hi",aN)` | **失败** |
| M4 | `aN=(1,2)`；`note=Text("hi",aN)` | **失败**（与 id 无关） |
| N2 | `ab=(1,2)`；`note=Text("hi",ab)` | **失败** |
| N5 | `aNx=(1,2)`；`note=Text("hi",aNx)` | **失败** |
| N1 | `NotePos=(1,2)`；`note=Text("hi",NotePos)` | 通过 |
| N6 | `AN=(1,2)`；`note=Text("hi",AN)` | 通过 |
| M5 / M1 | `Text("hi",(1,2))` / `P=(1,2)`；`tN=Text("hi",P)` | 通过 |
| N3 | `aN=(1,2)`；`d=Distance(aN,(0,0))` | 通过 |
| N4 | `aN=(1,2)`；`note=Text("hi",(x(aN),y(aN)))` | 通过 |
| M7 | `P=(1,2)`；`tN=Text("hi",Point(P))` | **失败** |

结论：GeoGebra 的 `Text(<文本>, <定位点>)` 只接受**大写开头标签的点**或**内联坐标**；小写开头标签（`aN`、`ab`、`aNx`）在该参数位不被解析为点对象，即使该对象在别的命令里完全可用（N3 通过）。`Point(P)` 这类计算式同样不被接受（M7）。

这正是本题的失败原因：会话自查的三个版本都踩了同一个坑，而仓库夹具用的是 `NotePos=(-4,5)` + `note=Text(message,NotePos)`（大写开头），所以夹具本身能过 120 项检查。**包内 Skill 与能力契约目前没有写这条命名限制**，因此这是可预防的文档缺口，而不是模型随机失误。累计三次失败后按规则停止，未交付。

### 3.3 10：拖动目标与固定辅助点重合（1 次修复）

失败样本：目标 `A`（数学坐标 `(3,0)`，屏幕 `(784.9, 428.5)`），`dx=60, dy=-50`，诊断 `overlaps: []`，30 s 后 `page.waitForFunction` 超时。

原因：会话为表达"A、B 重合"的退化情形，额外定义了 `Bd=Point(c)`、`initial=[3,0]`、样式 `fixed:true`，与可拖动的 `A`（同样 `initial=[3,0]`）**完全同址且可见、且后创建**。真实鼠标按下命中的是压在上层的 `Bd`，于是被监视的 `A` 坐标不变 → 等待超时。

工具当前的重叠诊断只统计**可移动**的可见点（[browser.ts:387](../src/browser.ts#L387)），因此固定在原地的 `Bd` 未进入 `overlaps`，属于诊断盲区：能捕获按下的对象不只限于可移动点。会话随后把该样本的拖动目标从 `A` 换成 `O`（保留 3 个样本），第二次 build 交付；这不改变任何数学条件。

## 4 与旧 smoke 的对照

| 项 | 旧 smoke（10-16） | 本轮 pilot |
| --- | --- | --- |
| 题干 | 脚本内置截短版（缺自选初态、非退化等约束） | fixtures 的完整 `prompt` |
| 安装副本 | 早于当前 Skill 修订 | 当前构建（dist 与 Skill 均与工作区一致） |
| 交付 | 3/4（01、05、10 通过） | 3/4（01、05、10 通过） |
| 08 | 失败：`Polygon(R,S,n)` 回退残留对象 | 失败：`Text` 定位点命名 |
| token | 11.11 M | 7.79 M |

两次交付率相同、08 两次都失败，但**失败原因不同**：旧批是原生表示在参数回退后残留未定义对象；本轮该表示问题已被会话自己的 `Take`/`Append` 模板规避，新的失败点是文档未覆盖的命名限制。因此不能把两批数据合并计算通过率，也不能用旧口径的结论代表新口径。

## 5 待办建议（未实施）

| 优先级 | 最小改动 | 责任位置 | 验收标准 |
| --- | --- | --- | --- |
| P0 | 在能力契约与 Skill 中写明：`Text` 的定位点必须用大写开头标签或内联坐标，禁止 `aN`/`ab` 这类小写开头名称；建议几何点统一用大写开头命名 | `skills/ggb-construction/references/capabilities.md`、`SKILL.md` | 新题不再出现该类失败；用本轮 M/N 变体作为反例保留 |
| P1 | 拖动歧义诊断覆盖**不可移动但可见**的同址点（现在只看可移动点），或在按下后校验是否真的抓住了目标对象 | `src/browser.ts` 的 `dragScreen`／`dragPoint` | 10 题的 `Bd`/`A` 同址场景在按下前即被拒绝并给出目标与遮挡对象；保留真实鼠标与位移门禁 |
| P1 | 变更后重跑 08（单题、1 会话）验证文档修复是否消除该失败类，再决定是否扩到 10 题 × 3 轮 | 本脚本 | 08 交付，且不依赖放宽门禁 |

## 6 证据与复现

| 路径 | 内容 |
| --- | --- |
| [dsh-smoke-results.json](../output/dsh-stability-pilot/dsh-smoke-results.json) | 4 次会话的完整行：交付、首次 build、修复次数、run 状态与错误码、token 用量、命令次数、外层复核结果 |
| [smoke/<题>/repeat-1/](../output/dsh-stability-pilot/smoke/) | 每题的 `events.jsonl`、`timeline.jsonl`、`stderr.log`、`prompt.txt`；`artifacts/` 为会话工作目录副本（含每次尝试的 `request.json`、`run.json`） |
| [probe/](../output/dsh-stability-pilot/probe/)、[summary.json](../output/dsh-stability-pilot/probe/summary.json)、[summary-names.json](../output/dsh-stability-pilot/probe/summary-names.json) | 13 个本地复现变体及其结果（零模型成本） |
| [blocked.json](../output/dsh-stability-pilot/blocked.json) | 首次被凭据挡住的那一轮（0 token、无请求被编写），说明本报告不含那批数据 |
| [provenance.json](../output/dsh-stability-pilot/provenance.json) | 被测版本、逐题题干摘要 |

```sh
# 题干与版本核对（零会话）
node scripts/benchmark-dsh.mjs output/dsh-stability-prep <installed> list
# 本轮同口径复跑（4 题 × 1 轮）
node scripts/benchmark-dsh.mjs output/dsh-stability-pilot <installed> smoke /private/tmp/ggb-dsh-stability-pilot
# 单题复跑（例如文档修复后的 08）
node scripts/benchmark-dsh.mjs output/dsh-stability-pilot2 <installed> smoke /private/tmp/ggb-dsh-stability-pilot2 08
```

## 7 未覆盖项

- 每题仅 1 个会话，**没有重复性证据**：不能给出"某题稳定通过"的结论，只能说明该次会话是否成功及失败原因。
- 只覆盖 4 题（历史上需要修复的那 4 题）；02、03、04、06、07、09 未测。
- token 与墙钟受本机负载与模型侧波动影响，只作量级参考；未记录模型侧排队时间。
- 外层复核验证的是交付可加载与交互样本通过，不做像素级比对；`skillLoaded` 字段只是工具名启发式（01 会话实际通过 `read`/`bash` 读取了 SKILL.md，该字段为 false，不能当作未加载技能的证据）。

## 8 修复与复验（P0／P1 已执行）

### 8.1 改了什么

| 项 | 位置 | 内容 |
| --- | --- | --- |
| P0 规则 | `capabilities.md`（依赖与交互两节）、`SKILL.md`（source 与拖动两条） | `Text` 的定位点必须是大写开头标签的点或内联坐标；`aN`、`ab` 这类小写开头标签在该参数位不被解析为点对象，`Point(P)` 这类计算式同样不被接受，几何点默认大写开头命名。拖动初态避开与其它可见点同址，包括 `fixed:true` 的固定点 |
| P1 诊断 | `src/browser.ts` 的 `dragScreen`／`dragPoint` | `overlaps` 改为覆盖**所有可见、已定义点**并逐点标记 `moveable`／`fixed`：可移动同址点仍报 `overlapping movable points`（原行为不变），同址固定点新增报 `overlapping fixed points`，依赖型可见点只记录不提前拒绝；错误详情含 target、sample、screen 与 overlaps |
| 记录 | `docs/CHANGES.md` 未发布节 | 补记上述两条 Skill 规则与拖动诊断范围 |

### 8.2 验证证据

| 验证 | 结果 |
| --- | --- |
| 场景复现（[probe-fixed-overlap.sh](../output/dsh-stability-pilot/probe-fixed-overlap.sh)，[fixed-overlap/](../output/dsh-stability-pilot/fixed-overlap/)） | 复刻 10 题原始场景（`A` 与 `fixed:true` 的 `Bd` 同址于 `(3,0)`）：**2.0 s 内拒绝**，原为 30 s 超时；错误 `Ambiguous drag target: overlapping fixed points`，诊断 `{"name":"Bd","moveable":false,"fixed":true}`，屏幕坐标与原失败一致 |
| 10 题夹具 1 轮（[interaction-regression-dragfix](../output/interaction-regression-dragfix/verify-results.json)） | 10/10 通过（构造、重载、交互、headless 预览），**无误拒** |
| 边界输入（[extras-results.json](../output/interaction-regression-dragfix/extras-results.json)） | 04-right、04-obtuse、10-coincident 全部通过；08 的 12→3 往返仍通过，原交付摘要未变 |
| 真实浏览器回归 | `pnpm test:browser` 全绿；单跑 interaction 三项通过，含 `overlapping movable points reject before the long movement timeout`；故障与启动 54 项通过 |
| 重新打包与安装 | 新包 sha256 `9a94b5f5…b7ce`；用 pnpm 11.7.0 装回验证 profile，doctor `smoke`／`casSmoke` 通过；包内 `dist/src/browser.js`、`SKILL.md`、`capabilities.md` 与工作区逐字节一致（[reinstall.json](../output/dsh-stability-prep/reinstall.json)、[provenance.json](../output/dsh-stability-prep/provenance.json)）；pilot 当次安装证据另存为 `*-pilot.json` |

### 8.3 08 单题复验（新会话，1 轮）

结果：**已交付**（[dsh-smoke-results.json](../output/dsh-stability-08fix/dsh-smoke-results.json)）。

| 项 | 值 |
| --- | --- |
| build | 2 次（首次未过，第二次交付） |
| 首次失败原因 | 自己声明的 style 检查要求 numeric 对象 `side`／`perimeter` `visible+labelVisible+caption`；原生数值不在画布显示，检查判 failed（`$style:side:0`），与 Text 命名无关 |
| 第二次修复 | 改为 `tSide=Text("边长 = "+side,(3.2,3.5))` 等**内联坐标**文字对象，检查改为 `type:text` + `style:visible` |
| 外层复核 | 3 个参数样本、3 个往返、46 项检查、`result.ggb` sha256 `b88e2118…` |
| 成本 | 399 s、2.21 M token；本次会话 `check` 预检 0 次（未走预检直接 build） |

结论：本轮没有再出现 `Text` 定位点执行失败，且成功写法正是新规则推荐的内联坐标形式。但这是 **n=1**，不能据此断言该类失败已根除；要达到统计结论仍需多轮会话（§5 的规模实验）。
