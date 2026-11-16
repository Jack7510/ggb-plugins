# 切线

- 模板：`tangents`
- 源请求：[06-tangents.json](../../examples/geometry-benchmark/06-tangents.json)
- 适用：圆、外点、切线、切点、垂直关系。

## 构图要点

从圆外点 P 作两条切线，切点 A、B 用原生命令生成；PA、PB 与切点处的直角关系分别核验。P 要保持在圆外，远离圆心的位置变化要有样本覆盖。

## 核验点

- P 在圆外，A、B 在圆上。
- PA、PB 与对应半径垂直，切点处角度为 90°。
- PA=PB，拖动 P 后切点与长度关系仍成立。
- P 进入圆内或与圆心重合时，构造要有明确失败或未验证状态。

## 课堂用法

拖动 P 观察两条切线长度相等；讨论切线与半径垂直的判定。插件不给出证明，只保留关系证据。

## 产物与报告

```sh
node scripts/render-report.mjs --delivery <交付目录> --output tangents.html
```
