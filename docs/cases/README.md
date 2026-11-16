# 教师一题一档案例库

每个案例对应一个可运行模板，记录构图要点、核验点、课堂用法和报告命令。案例库不提供题目答案，也不把题型分支写进 Skill；它是插件之外的教师内容层。

| 案例 | 模板 | 课堂主题 |
| --- | --- | --- |
| [中点与中线](midpoint-median.md) | `midpoint-median` | 中点、中线、拖动联动 |
| [圆周角与圆心角](inscribed-angle.md) | `inscribed-angle` | 同弧所对角、路径点 |
| [动点与滑块](moving-slider.md) | `moving-slider` | 参数化、对象生命周期 |
| [函数图像](function-graph.md) | `function-graph` | 函数、关键点、双视图 |
| [轨迹与中点路径](midpoint-locus.md) | `midpoint-locus` | 轨迹、路径点、退化 |
| [外接圆](circumcircle.md) | `circumcircle` | 中垂线、外心 |
| [内切圆](incircle.md) | `incircle` | 角平分线、内心、切点 |
| [切线](tangents.md) | `tangents` | 切线、垂直、外点 |
| [最短路径](shortest-path.md) | `shortest-path` | 轴对称、共线、最短 |
| [椭圆焦点](ellipse-focus.md) | `ellipse-focus` | 焦点、焦点三角形 |

## 使用流程

1. 从 [题型模板](../../examples/templates/README.md) 复制同类型请求，替换 `prompt` 与必要的初始条件。
2. 先 `check`，再 `build`；失败时只修证据指出的根因，不放宽检查。
3. 交付后查看 `verification.json` 与 `preview.png`，需要打印时运行：

```sh
node scripts/render-report.mjs --delivery <交付目录> --output <案例>.html
```

4. 在课堂上打开交互预览，让学生拖动对象；把报告作为“这题做了哪些核验”的档案，而不是答案页。

## 边界

- 案例是输入与教学记录，不是新的题型路由；不要据此在 Skill 中增加关键词分支。
- 有限样本、CAS 结果和截图都只是证据，不是一般性证明。
- 报告中出现 `failed` 或 `unverified` 时，正式交付不成立；先修复或明确报告能力缺口。
