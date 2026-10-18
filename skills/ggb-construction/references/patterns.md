# 构图模式（按需读取）

本文件记录可复用的构法，不替代请求字段与检查谓词的契约（见
[能力契约](capabilities.md)）。示例请求见 `examples/v2-cases/`。

## 可变边数的正多边形

边数由滑块控制，多边形随 n 重算：

```text
n=Slider(3,10,1)
poly=Polygon(Sequence(Rotate(A, 2*pi*k/n, O), k, 0, n-1))
```

- 只声明 `poly`。`Sequence` 生成的顶点与边由引擎命名，随 n 改变，
  不能逐个声明；引擎据此回报的实际标签只有主标签。
- 固定顶点写法 `Polygon(A,v1,v2,...)` 会为每条边创建自动标签，
  实际标签常包含受保护名 `e`、`i`，无法完整声明。题目给定边数且需要
  逐点核验时，改用 `Rotate` 生成顶点再加显式 `Segment`。
- `Slider` 的初始值等于最小值（上例初始 n=3）。

### 聚合核验

动态标签不能逐点引用，改用与 n 无关、返回数值的表达式，并在采样的 n
下复验（`interactions: [{parameter:"n", value:7}]`）：

```text
Area(poly)-n/2*Distance(O,A)^2*sin(2*pi/n)
Perimeter(poly)-2*n*Distance(O,A)*sin(pi/n)
Max(Sequence(abs(Distance(O,Vertex(poly,k))-Distance(O,A)),k,1,n))
Max(Sequence(abs(Distance(Vertex(poly,k),Vertex(poly,Mod(k,n)+1))-2*Distance(O,A)*sin(pi/n)),k,1,n))
```

前两条核对面积与周长，后两条分别核对全部顶点到圆心的距离一致（内接）
与全部边长一致（正）。期望值 0。

## 有界可变数量的轮廓

无法用原生 `Polygon` 表达可变顶点数时，可先生成容量固定的辅助对象，
再取活动前缀；轮廓用 `Polyline`。容量上限必须来自题目，
且填充面或原生 `Polygon` 类型不能用轮廓替代。细节见能力契约中关于有界可变数量构造的
段落。
