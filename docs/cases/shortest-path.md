# 最短路径

- 模板：`shortest-path`
- 源请求：[09-shortest-path.json](../../examples/geometry-benchmark/09-shortest-path.json)
- 适用：轴对称、折线最短、共线。

## 构图要点

直线 l 同侧取 A、B；把 A 关于 l 对称到 A'，连接 A'B 与 l 的交点即 P₀。A'、P₀ 和共线关系都用原生构造，不用目测或固定坐标。同时保留可拖动点 P 与当前路径，便于对照。

## 核验点

- A' 是 A 关于 l 的对称点，AP=A'P。
- A'、P₀、B 共线，P₀ 在 l 上。
- 当前路径 AP+PB 与最短路径 A'B 的长度关系。
- 拖动 A、B 或 P 后，对称与共线仍成立；退化或越界要报告。

## 课堂用法

拖动 P 观察路径长度变化，再拖动 A、B 看最短点如何移动。适合讲“将军饮马”模型；插件只呈现构造与证据，不替学生写证明。

## 产物与报告

```sh
node scripts/render-report.mjs --delivery <交付目录> --output shortest-path.html
```
