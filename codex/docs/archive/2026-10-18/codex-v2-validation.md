# Codex 当前插件与 v2-cases 验证

> 历史归档（2026-10-18）：仅说明文中版本与验收范围，不代表当前代码或安装包状态。见[归档索引](../../../../docs/archive/README.md)。

日期：2026-10-17。本文记录当前源码打包后的 Codex 安装副本。版本字段仍为 0.8.0；本次开发包不是公开 0.8.0 发布资产。

下列内容保留首次验证记录。当前修复与安装状态见 [展示修复复验](#展示修复复验)。

## 版本与执行范围

源码提交：`f003a3029dd64cc6050eda835ecb080e88143dc8`。测试开始时只有未跟踪的 `talks/`，未修改其内容。本轮没有修改生产代码、Skill 或原始案例。

本轮重新编译、生成 Codex ZIP、更新 marketplace 并安装插件。实际调用目录：

```text
/Users/lijunqiang1/.codex/plugins/cache/ggb-plugins-local/ggb-plugins/0.8.0
```

marketplace 源保存在 `~/.codex/local-marketplaces/ggb-plugins-v2-validation-20261017`，不依赖清理前的 output 暂存目录。安装副本 13 个编译模块加 Skill、能力引用、capabilities.json 和 viewer，共 17 个文件与当前构建逐字节一致。安装副本独立准备依赖及官方 runtime，doctor 的 smoke 与 casSmoke 通过。

ZIP SHA-256：`01ee160abb7aed1c3ebf423e3e416decb0a3135d1895f25d6506dcbef5a28f99`。

本轮由当前 Codex 会话读取最新 Skill，并调用安装副本 CLI。7 个 JSON 只改运行副本的 outputDir；另外两题由原题部分编写原生请求。抛物线 Markdown 明确复用 parabola.json，因此 10 个文件对应 9 个独立案例。没有把这次运行称为 9 个全新宿主会话的自动生成测试。

## 结果

7 个既有 JSON 首次全部通过。两道新增请求首次输出声明错误，各修正一次后通过。总计 11 次 build，9 个最终交付均通过构造、磁盘重载、交互采样及 headless preview --once。

| 案例 | 首次运行 | 请求修复次数 | 成功 build / ms | 预览复核 / ms | 交互样本 |
| --- | --- | --- | --- | --- | --- |
| bisector.json | 通过 | 0 | 1905 | 694 | 1 |
| circle.json | 通过 | 0 | 1921 | 713 | 1 |
| dashed-blue-circle.json | 通过 | 0 | 1905 | 702 | 1 |
| general-horse.json | 通过 | 0 | 2909 | 793 | 3 |
| parabola.json | 通过 | 0 | 2013 | 712 | 1 |
| transfer.json | 通过 | 0 | 1933 | 691 | 1 |
| triangle.json | 通过 | 0 | 1955 | 748 | 1 |
| ellipse-focal-chord.json | 输出声明错误 | 1 | 2482 | 724 | 3 |
| hyperbola-asymptote-rectangle.json | 输出声明错误 | 1 | 1987 | 727 | 1 |

补写请求的失败来自 Polygon 自动边标签：椭圆三角形实际返回 tri/f2/a/b，双曲线四边形实际返回 rect/o/a/m/b。修复只更新 outputs，数学检查、期望值与容差未改。失败运行、截图及原始请求仍保留。

椭圆案例验证非顶点交点、焦点距离关系和三角形，并对三个滑块值执行往返检查。双曲线案例验证曲线约束、垂足与四边形，并保留一个真实鼠标样本；采样集中在初态所在右支，不构成两支全域证明。

pnpm check、构建和 76 项离线测试通过。离线测试初次受到沙箱本地监听与 npm 缓存权限限制；保留初次日志，在允许监听且使用独立 npm 缓存的环境中复跑通过。没有为消除失败修改断言。本轮未额外运行全量 test:browser；上述 9 例均实际运行安装副本的真实浏览器核验。

## 展示审查与未验收项

- 已查看 9 张交付截图，图形、颜色、虚线、填充和关键对象可见。
- general-horse.json 的 Text 包含完整不等式与取等条件推导，不符合当前 Skill 的“不提供完整证明”边界。运行门禁不会审查自然语言内容；该例仅计执行核验通过，不计内容边界通过。本轮保留原夹具，没有静默删掉文字后冒充原案例通过。
- 椭圆、双曲线标题显示原始 LaTeX 标记；长标题被截断。中文页面的操作帮助仍为英文。这些是展示问题，未修改 viewer。
- 本轮未验证新会话中的 Skill 自动发现刷新，也未覆盖已有 GGB 编辑／继续构造；该目录未提供对应输入。客户端若仍显示旧技能摘要，应刷新插件或新建会话。
- 最终可见预览单独启动；以实际 CLI 就绪输出判定是否打开，不能由本报告预先宣称成功。

## 证据与复现

证据目录：[output/codex-v2-validation](../../../../output/codex-v2-validation/)。文件位于本机，未提交产物。

| 证据 | 内容 |
| --- | --- |
| provenance.json | 提交与 17 个文件的摘要对比 |
| package.log、installed-before.json、installed-after.json、setup.log | 包、安装源与独立 doctor |
| baseline-results.json、authored-results.json、authored-repair-results.json | 完整 CLI 返回、退出码与墙钟 |
| baseline/、authored/、authored-repair/ | 每次请求、stdout/stderr、run.json、核验报告、截图与 GGB |
| summary.json | 汇总及各交付的 GGB 摘要 |
| offline-tests.log、offline-tests-final.log | 沙箱限制与最终 76 项通过记录 |

后续复现先确认当前插件目录和源码摘要，再使用新的输出目录。CLI 与核验协议见 [Skill 能力契约](../../../../skills/ggb-construction/references/capabilities.md)，安装方法见 [安装说明](../../../README.md)。

## 展示修复复验

日期：2026-10-17。本轮修改 viewer、将军饮马案例和对应浏览器测试。首次验证的失败与展示问题仍保留在上文，不用新的产物覆盖历史证据。

### 修改与边界

- 将军饮马的三条 Text 改为构造对称点、拖动路径点和观察辅助线段的提示。删除可见文字中的完整不等式与取等条件推导；保留全部原生对象、数学检查、期望值、样式和三个真实拖动样本。
- viewer 将简单数学片段转为纯文本：支持 `$...$` 与 `\(...\)`、数字上下标、triangle、简单 frac/dfrac、sqrt 及少量比较符号。长标题自动换行，不再省略尾部。
- 这不是完整 LaTeX 排版器。未知命令与复杂嵌套保留原片段。HTML 只作为文字显示，不引入远程资源或新依赖。原始 prompt、tooltip、来源和 GGB 不被标题转换改写。
- 数学执行、事实采集、固定容差、重载、参数往返和交付提交逻辑均未修改。

### 安装与复跑

重新生成并安装当前 Codex 开发包。marketplace 源为 `~/.codex/local-marketplaces/ggb-plugins-v2-display-fix-20261017`，实际安装缓存路径与上文相同。17 个关键文件再次逐字节一致。仅保留并恢复同一安装副本已有的 runtime，安装前后 runtime.lock.json 相同，没有借用源码 checkout 或 DSH 缓存。安装器 doctor 的 smoke 与 casSmoke 通过。

新 ZIP SHA-256：`55867915e018610bb2cc631b312f33d5d6577d86d4e267917e2c564e1fce5d56`。

四例复跑均首次通过 check、build 和 headless preview --once，无请求修复：

| 案例 | build / ms | 预览复核 / ms | 保留的交互样本 |
| --- | --- | --- | --- |
| ellipse-focal-chord.json | 2371 | 732 | 3 |
| general-horse.json | 2949 | 720 | 3 |
| hyperbola-asymptote-rectangle.json | 1978 | 714 | 1 |
| parabola.json | 2014 | 736 | 1 |

对照修复前后交付，四例的原始 prompt、requirements 和 interactions 均相同；数学对象快照通过生产 compareSnapshots 比较。将军饮马只排除本次明确修改的 text 对象，其他对象保持一致。四张完整页面截图均已人工查看：将军饮马不再显示完整证明，椭圆和双曲线标题不再显示这些原始 LaTeX 标记，长题干完整换行。

类型检查、构建、76 项离线测试和 3 项真实浏览器回归通过。浏览器回归覆盖标题转换、未知语法回退、货币文本不被转换、HTML 不执行、原始请求与 GGB 事实保留、文字默认样式重载及中英文预览。没有因展示修改重复执行全仓浏览器组；受影响的四例已运行完整生产门禁。

中文 headless 页面操作帮助仍显示英文，未在本轮扩展修复。新宿主会话的 Skill 自动发现、已有 GGB 编辑／继续构造及完整 LaTeX 排版不在本轮验收范围。

### 新证据

[output/codex-v2-display-fix](../../../../output/codex-v2-display-fix/) 包含本轮证据：

| 文件 | 内容 |
| --- | --- |
| general-horse-before.json | 修改前三条文字与完整原始请求 |
| provenance.json、package.log、install.log、runtime-preservation.json、setup.log | 安装摘要、包摘要、同副本资源保留及 doctor |
| viewer-tests.log、offline-tests.log | 3 项真实浏览器回归与 76 项离线检查 |
| rerun-results.json、rerun/ | 四例的请求、命令日志、逐次运行日志、核验与 GGB |
| audit.json、*-audit.png、title-regression-*.png | 前后不变量对照、标题审查与截图 |

最终可见预览另记在 final-preview.log；就绪 JSON 是实际打开依据。


## 后续统一修复

本报告保留两轮历史数据。之后的对象依赖、样式归属、采样覆盖及原文标题统一修复，以 [统一门禁验证](../../../../docs/archive/2026-10-18/unified-validation.md) 为准；不把历史包或旧事实报告当作当前版本验收证据。
