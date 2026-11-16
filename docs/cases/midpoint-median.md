# 中点与中线

- 模板：`midpoint-median`
- 源请求：[triangle.json](../../examples/v2-cases/triangle.json)
- 适用：三角形、中点、线段与样式要求。

## 构图要点

三角形 ABC 用自由点建立；AB 的中点用原生命令 `Midpoint(A,B)`，不手算坐标；CM 由 `Segment(C,M)` 生成。M 与 CM 的红色、点名和线宽属于显示要求，单独检查。

## 核验点

- M 的坐标等于 A、B 的中点，并声明对 A、B 的依赖。
- CM 的端点确实是 C 与 M，而不是重新取点。
- 拖动 A 或 B 后，中点与中线仍联动；固定约束仍逐样本复验。
- 样式检查覆盖颜色、标签可见性与线宽，不用截图代替。

## 课堂用法

适合讲“中线把三角形分成两个等面积三角形”前的作图准备。让学生拖动 A、B，观察 M 的位置变化，再讨论面积关系；本插件只作图与核验，不给出面积结论。

## 产物与报告

构建成功后在交付目录查看 `verification.json`、`preview.png` 和 GGB；需要打印时运行：

```sh
node scripts/render-report.mjs --delivery <交付目录> --output midpoint-median.html
```
