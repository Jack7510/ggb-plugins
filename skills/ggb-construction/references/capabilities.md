# 原生二维程序与核验契约（M5 / 0.5.0）

统一入口为 `build --request <file>`。请求协议是 2，CLI 结果信封仍是 1。旧协议请求与交付须重新生成。GeoGebra 负责解析数学语法，不按题型或数学命令白名单选择实现。

## 请求

```json
{
  "protocolVersion": 2,
  "prompt": "求 x²-5x+6=0 的实数解。",
  "locale": "zh-CN",
  "outputDir": "/absolute/output",
  "plan": {
    "program": [
      {"id":"roots","op":"native","mode":"cas","source":"Solutions(x^2-5x+6=0,x)"}
    ],
    "requirements": [{
      "id":"solutions", "source":"求 x²-5x+6=0 的实数解",
      "checks":[
        {"kind":"expression","subjects":["roots"],"expression":"Length(roots)","mode":"algebra","expected":2,"scope":"initial"},
        {"kind":"expression","subjects":["roots"],"expression":"Sum(roots)","mode":"algebra","expected":5,"scope":"initial"},
        {"kind":"expression","subjects":["roots"],"expression":"Product(roots)","mode":"algebra","expected":6,"scope":"initial"}
      ]
    }],
    "interactions": [],
    "display": "algebra"
  }
}
```

保留用户原文、可选 `clarifications: [{question,answer}]`。每个 requirement 有唯一 ID、输入中的原文 source 和非空 checks。不得写入检查结果、容差或未知字段。图片由宿主读取并转述题意；把来源和歧义澄清保存在 prompt/clarifications，不把图片当脚本输入。

## 原生构图程序

每步包含 `id`、`op:"native"`、`mode`、`source`。同一原生程序均使用 native 步骤，按顺序执行。

- `mode:"algebra"`：source 是一条完整英文 GeoGebra 数学语句，包括命名、方程、函数、嵌套命令、列表、矩阵等。例如 `p: y^2=4x`、`A=Point(d)`、`g=Derivative(f)`。
- `mode:"cas"`：source 是 CAS 数学表达式，例如 `Factor(x^4-1)`、`Expand((x+2)^3)`、`Solutions(x^2-1,x)`。工具等待 CAS 就绪，执行计算，并把结果赋给 id，成为可重载的原生对象。
- 可选 `outputs:[ID,...]` 声明需要引用的多个输出，包含 id；缺省为 `[id]`。CAS 只物化一个命名结果。GeoGebra 附属对象也会采集，但要引用或设置样式时必须声明其名称。输出已存在、缺失或未定义均失败。
- 可选 `initial:[x,y]` 只初始化该步可移动点，适用于准线等路径上的点。原生约束仍生效，不把初始化坐标当作题目给定条件。

ID 为 1–32 位 ASCII 字母、数字或下划线，首位为字母。e/i/x/y/z/pi 和 GgbProbe 前缀保留。中文显示名用 caption。源文本不会拼接到 shell，也不会作为 JavaScript 执行。小数写普通十进制或 `10^(-7)`；不要写会被解释为欧拉常数表达式的 `1e-7`。

新数学命令直接由固定 runtime 解析，不需新增 TypeScript 包装。任意 JavaScript、脚本触发器、外部资源、文件操作和三维材料不在开放范围；呈现通过结构化 styles 设置。未知命令、计算未决及超时返回真实错误，不允许降级为已通过。

M5 CAS 物化的是当次计算结果，不是持久 CAS 会话或动态 CAS 单元；它不会自动保留原 CAS 输入到参数的依赖。需要参数联动时，使用 Algebra 中的原生命令依赖并加检查；不得把静态 CAS 结果描述为动态构造。条件解、任意 CAS 单元及全命令覆盖仍需后续验收。

## 通用核验

`expression` 检查有 subjects、expression、mode、expected 和 scope。subjects 必须指向程序声明的对象且实际出现在表达式中。expected 为布尔或有限数值；不是模型提交的 passed。

- Algebra 例：`Distance(T,p)` 期望 0；`AreEqual(Tangent(T,p),b)` 期望 true。
- CAS 例：`Simplify(g(x)-(3x^2+2))` 期望 0。使用原生引擎比较符号关系，不比较格式化字符串来断言数学等价；保留定义域及必要假设。
- 工具创建临时原生探针，检查类型和定义有效性，读取结果后删除，并审计原对象未改变。缺失、未定义、非标量和未决结果为 unverified，不能用 API 返回的默认 0 冒充答案。
- `initial` 只检查原构型和文件重载。`sampled` 还在真实拖动副本中检查；至少声明一个交互样本。采样不是全域证明。

可复用的结构检查仍可使用 exists、type、coordinate、dependsOn、style，以及中点、线/圆上的点、圆心半径、平行垂直、等长、距离和非共线。新数学关系优先写表达式，不逐命令增加谓词。type 使用实际事实类型，简单多边形归一为 polygon。

依赖证据取自原生 XML 和定义。独立对象不能冒充依赖对象；带局部绑定或复杂命令参数、无法明确解析的依赖返回 unverified。M5 不提供完整 GGB 作用域解析器。不能删除依赖要求来绕过这一边界。

## 呈现与交互

`styles:[{object,properties}]` 支持 visible、labelVisible、color（#RRGGBB）、lineThickness（1–13）、lineStyle（0–4）、caption（1–100 字）、fixed。点默认显示名称。原生列表和数值不强制在图形画布可见；关键几何对象需明确 `visible:true` 及对应 style 检查。

`view:{xMin,xMax,yMin,yMax}` 设置图形范围。`display:"graphics"`（默认）显示二维画布；`display:"algebra"` 显示完整原生 Algebra 视图，允许无自由点、无拖动样本，不强行执行图形缩放检查。

`interactions:[{point,dx,dy}]` 是真实鼠标拖动样本，支持实际可移动自由点和路径点。像素位移各不超过 120，长度至少 20，同一点不重复。代数视图不能声明画布拖动。滑块及其他交互扩展留给 M6。

M1 回归的 freePoint/command 结构化原语保留在协议 2，仍编译到同一执行器；其旧命令表仅限制这种旧编写形式，不限制 native 程序。不要在同一程序混合两种形式。示例见 examples/triangle.json、parabola.json 和 algebra.json（源码仓库）。

## 交付与失败

构造、必需核验、GGB 重载及交互检查通过后，关闭资源，再原子提交 result.ggb、request.json、verification.json、preview.png 和 manifest.json。M5 清单协议为 2；preview 复核报告、摘要和实际重载结果。构图与验证均 headless，成功后才用 Chrome 展示；关窗自动退出专用浏览器和本地服务，不回写文件。

容量和时限由 doctor/schema 给出。失败保留运行路径和原因；CAS 不就绪、语法错误、对象未定义、探针污染原对象和数学条件不满足均不能交付。最多三次新运行，保留要求；未验证必须说明能力缺口。

官方依据：[Apps API](https://geogebra.github.io/docs/reference/en/GeoGebra_Apps_API/)、[命令目录](https://geogebra.github.io/docs/manual/en/commands/All_Commands/)、[CAS 命令](https://geogebra.github.io/docs/manual/en/commands/CAS_Specific_Commands/)。命令可接入不等于全部命令已验收，也不等于任意数学问题可求解。
