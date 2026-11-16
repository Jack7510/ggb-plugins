# 轨迹与中点路径

- 模板：`midpoint-locus`
- 源请求：[10-midpoint-locus.json](../../examples/geometry-benchmark/10-midpoint-locus.json)
- 适用：路径点、轨迹、动态中点。

## 构图要点

圆上点 B 用路径点约束在圆上；弦 AB 的中点 M 由原生命令生成；轨迹使用 `Locus` 或等价原生关系，底圆由轨迹的几何关系导出，而不是另画一个近似圆。A、B 重合时弦退化，要保留定义状态说明。

## 核验点

- B 始终在圆上，A、B 的位置约束有效。
- M 是弦 AB 的中点，并依赖 A、B。
- 轨迹由真实运动关系生成；拖动 B 后轨迹仍对应同一关系。
- 退化位置不伪造 passed；需要时报告未定义或未验证。

## 课堂用法

拖动 B 让学生观察中点轨迹，再讨论轨迹圆的圆心与半径。适合把“动点轨迹”从静态截图变成可操作对象。

## 产物与报告

```sh
node scripts/render-report.mjs --delivery <交付目录> --output midpoint-locus.html
```
