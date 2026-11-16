# 题型模板

10 个可复用的二维题型入口。每项指向一份完整、可运行的请求；复制后替换 `prompt`，保留题目条件对应的检查。模板不是答案库，也不把题型分支写进 Skill。

| 模板 | 文件 | 主要核验 |
| --- | --- | --- |
| 中点与中线 | [triangle.json](../v2-cases/triangle.json) | 中点、依赖、拖动 |
| 圆周角与圆心角 | [05-inscribed-angle.json](../geometry-benchmark/05-inscribed-angle.json) | 角度关系、路径点、拖动 |
| 动点与滑块 | [slider-polygon.json](../v2-cases/slider-polygon.json) | 参数往返、对象存活 |
| 函数图像 | [parabola.json](../v2-cases/parabola.json) | 表达式、关键点、视图 |
| 轨迹与中点路径 | [10-midpoint-locus.json](../geometry-benchmark/10-midpoint-locus.json) | 轨迹、路径点、依赖 |
| 外接圆 | [01-circumcircle.json](../geometry-benchmark/01-circumcircle.json) | 圆心、等距、拖动 |
| 内切圆 | [02-incircle.json](../geometry-benchmark/02-incircle.json) | 内心、半径、切点 |
| 切线 | [06-tangents.json](../geometry-benchmark/06-tangents.json) | 切点、垂直、拖动 |
| 最短路径 | [09-shortest-path.json](../geometry-benchmark/09-shortest-path.json) | 对称、共线、距离 |
| 椭圆焦点 | [ellipse-focus-triangle.json](../v2-cases/ellipse-focus-triangle.json) | 焦点、距离和、样式 |

机器可读索引见 [templates.json](templates.json)。每项的 `case` 指向 [教师案例库](../../docs/cases/README.md) 中的一题一档说明。

## 使用方式

```sh
node dist/src/cli.js inspect --ggb /absolute/base.ggb   # 仅在修改已有图时需要
node dist/src/cli.js build --request /absolute/request.json
node scripts/render-report.mjs --delivery /absolute/delivery --output /absolute/report.html
```

模板中的 `outputDir` 是仓库内测试路径；复制到用户工作区时改成实际输出根。不要为了适配模板删掉题目条件或放宽检查。
