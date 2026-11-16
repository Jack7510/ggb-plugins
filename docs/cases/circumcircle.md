# 外接圆

- 模板：`circumcircle`
- 源请求：[01-circumcircle.json](../../examples/geometry-benchmark/01-circumcircle.json)
- 适用：三角形、中垂线、外心、外接圆。

## 构图要点

三条边的中垂线用原生命令，外心取中垂线交点，外接圆过三个顶点。不要用“画一个看起来经过三点的圆”替代构造。OA、OB、OC 的长度作为独立观测。

## 核验点

- 三条中垂线真实存在并依赖对应边。
- 外心是三条中垂线的交点，OA=OB=OC。
- 外接圆经过 A、B、C，拖动顶点后仍成立。
- 退化三角形（三点共线或重合）要被拒绝或报告，不静默交付。

## 课堂用法

拖动顶点观察外心位置变化；讨论锐角、直角、钝角三角形外心的位置差异。插件提供可操作图形和证据，不替学生总结定理。

## 产物与报告

```sh
node scripts/render-report.mjs --delivery <交付目录> --output circumcircle.html
```
