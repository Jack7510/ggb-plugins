# 构图模式（按需读取）

本文件记录可复用的构法，不替代请求字段与检查谓词的契约（见
[能力契约](capabilities.md)）。示例请求见 `examples/v2-cases/`。

## 可变边数的正多边形

边数由整数滑块控制，多边形始终使用整数边数重算：

```text
n=Slider(3,12,1)
poly=Polygon(Sequence(Rotate(A, 2*pi*k/round(n), O), k, 0, round(n)-1))
```

- `round(n)` 必须同时用于 `Sequence` 的顶点数和 `Rotate` 的角度。
  不能把原始 `n` 直接用于这两处：`setValue` 可以绕过滑块增量写入 3.5，
  而 `Sequence` 会截断顶点数、`Rotate` 仍按 3.5 等分，得到非正多边形。
- `round(n)` 是构造兜底，不表示小数 `n` 合法。输入域仍由独立检查拒绝。
  如需可读的 `m=round(n)`，要把 `m` 作为单独的 native 步骤声明输出并隐藏；
  内联写法可以保持只声明 `poly`。
- 只声明 `poly`。`Sequence` 生成的顶点与边由引擎命名，随边数改变，
  不能逐个声明；引擎据此回报的实际标签只有主标签。
- 固定顶点的位置参数形式 `Polygon(A,v1,v2,...)` 还会返回边标签，自动命名
  可能碰到受保护名或已有对象。只需面对象时用 `poly=Polygon({A,v1,v2,...})`，
  固定 runtime 只返回 poly；仍可用 Vertex 和依赖检查逐点核验。需要逐边属性时，
  先生成顶点，再显式构造 Segment；不要猜测自动边名。
- `Slider` 的初始值等于最小值（上例初始 n=3）。边数滑块使用步长 1。

### 聚合核验

动态标签不能逐点引用，改用返回数值的聚合表达式，并在采样的 n
下复验（`interactions: [{parameter:"n", value:7}]`）。所有公式使用
`round(n)`，不要用原始 `n`：

```text
n-round(n)
Length(Sequence(Vertex(poly,j),j,1,round(n)))-round(n)
Area(poly)-round(n)/2*Distance(O,A)^2*sin(2*pi/round(n))
Perimeter(poly)-2*round(n)*Distance(O,A)*sin(pi/round(n))
Max(Sequence(abs(Distance(O,Vertex(poly,k))-Distance(O,A)),k,1,round(n)))
Max(Sequence(abs(Distance(Vertex(poly,k),Vertex(poly,Mod(k,round(n))+1))-2*Distance(O,A)*sin(pi/round(n))),k,1,round(n)))
```

第一条拒绝小数边数，第二条核对顶点数，随后核对面积、周长、全部顶点到
圆心的距离一致（内接）与全部边长一致（正）。期望值均为 0。顶点数必须用
显式 `Sequence`；`Length(Vertex(poly))` 在 GeoGebra 中不可靠。采样必须覆盖
3 和 12；3.5、4.5、7.5 是非法输入，应在回归中确认被拒绝，不能作为交付样本。

## 有界可变数量的轮廓

无法用原生 `Polygon` 表达可变顶点数时，可先生成容量固定的辅助对象，
再取活动前缀；轮廓用 `Polyline`。容量上限必须来自题目，
且填充面或原生 `Polygon` 类型不能用轮廓替代。细节见能力契约中关于有界可变数量构造的
段落。


## 派生关系的完整依赖

每条关系按定义输入验收，不能只保留滑块依赖。例如焦点 F_1 已从 ell 派生，
过该点的直线可用 `g: y-y(F_1)=k*(x-x(F_1))`，并声明：

```json
{"kind":"dependsOn","subjects":["g","F_1","ell","k"],"scope":"sampled"}
```

`g: y=k*(x+1)` 即使在当前焦点为 (-1,0) 时位置正确，也没有使用 F_1。
只检查 pointOn(F_1,g) 和 dependsOn(g,k) 会遗漏这条关系。
依赖检查与独立数学期望并存；sampled 还需要相关交互，initial 也会重载复验。
