# 原生二维程序与核验契约（M6 / 0.6.0）

执行入口为 `build --request <file>`；先用 `check --request <file>` 进行无浏览器的结构预检。修改已有 GGB 属于编辑模式，先用 `inspect --ggb <file>` 取得对象清单，见[编辑已有 GGB](#编辑已有-ggb-p0)。check 复用 schema 和 compile，检查来源及声明引用；返回 validation:structural，不核验引擎语法、实际输出标签或数学关系。请求协议是 2，CLI 结果信封仍是 1。M1/M5 的协议 2 请求仍可执行；旧交付须重新构造以补齐 M6 证据。GeoGebra 负责解析数学语法，不按题型或数学命令白名单选择实现。

请求编写及交付展示遵循 [分析与作图边界](../SKILL.md#分析与作图边界)。下列示例绘制给定函数，不输出零点答案；底层 CAS 和核验数据能力仍保留。

## 请求

```json
{
  "protocolVersion": 2,
  "prompt": "绘制函数 y=x²-5x+6 的图像，用于观察与探索，不给出零点答案。",
  "locale": "zh-CN",
  "outputDir": "/absolute/output",
  "plan": {
    "program": [
      {"id":"f","op":"native","mode":"algebra","source":"f(x)=x^2-5x+6"}
    ],
    "requirements": [{
      "id":"graph", "source":"绘制函数 y=x²-5x+6 的图像",
      "checks":[
        {"kind":"type","subjects":["f"],"objectType":"function","scope":"initial"},
        {"kind":"expression","subjects":["f"],"expression":"f(0)","mode":"algebra","expected":6,"scope":"initial"},
        {"kind":"style","subjects":["f"],"properties":{"visible":true},"scope":"initial"}
      ]
    }],
    "interactions": [],
    "styles": [{"object":"f","properties":{"visible":true}}],
    "display": "graphics"
  }
}
```

工作语言由 Agent 选择中文或英文；新请求 locale 使用 zh-CN 或 en，最终预览据此显示说明与结束按钮。caption 和 Text 由 Agent 用所选语言编写。locale 不翻译来源、命令、协议字段或原始诊断；其他既有 locale 值仍可解析，预览以英文回退。

保留用户原文、可选 `clarifications: [{question,answer}]`。每个 requirement 有唯一 ID、输入中的原文 source 和非空 checks。不得写入检查结果、容差或未知字段。图片由宿主读取并转述题意；把来源和歧义澄清保存在 prompt/clarifications，不把图片当脚本输入。

## 编辑已有 GGB（P0）

编辑模式的输入是“已有 GGB + 文字指令”，输出是新的 GGB 文件；原文件只读。当前只支持显示属性，不支持增删对象、改值、改结构或改视图。

```sh
node <plugin>/dist/src/cli.js inspect --ggb /absolute/base.ggb
```

inspect 读取归档、审计后在全新 applet 打开，返回 `sha256`、`bytes`、`version`、`entries`、`view` 和 `objects`（每个对象的 `name`、`type`、`defined`、`dependent`、`moveable`、`fixed`、`visible`、`color`、`lineThickness`、`lineStyle`、`filling`、`labelVisible`、`caption`、`definition`）。请求中的 `base.sha256` 必须等于该值；文件改动后必须重新 inspect。

```json
{
  "protocolVersion": 2,
  "prompt": "把三角形 aTri 填充改成蓝色 30%，隐藏 txtSum 文字",
  "locale": "zh-CN",
  "outputDir": "/absolute/output",
  "base": { "path": "/absolute/base.ggb", "sha256": "<inspect 返回的 sha256>" },
  "plan": {
    "edits": [
      {"object":"aTri","properties":{"color":"#3C78D8","filling":0.3}},
      {"object":"txtSum","properties":{"visible":false}}
    ],
    "requirements": [{
      "id":"appearance", "source":"填充改成蓝色 30%，隐藏 txtSum 文字",
      "checks":[
        {"kind":"style","subjects":["aTri"],"properties":{"color":"#3C78D8","filling":0.3},"scope":"initial"},
        {"kind":"style","subjects":["txtSum"],"properties":{"visible":false},"scope":"initial"}
      ]
    }],
    "interactions": []
  }
}
```

- `edits` 每项的 `properties` 只允许 `color`、`lineThickness`、`lineStyle`、`filling`、`labelVisible`、`visible`；同一对象只能出现一次。`filling` 只适用于封闭图形（圆、圆锥曲线、多边形、扇形、弧、不等式区域），`lineThickness`／`lineStyle` 只适用于有轮廓的对象。
- 编辑请求不含 `program`、`styles`、`view` 与 `interactions`。基线自身带视图，重建或平移视图会破坏“只改声明字段”。
- 对象名来自文件，可含撇号或下标（如 `A'`、`B_{1}`）；`check` 的 subjects 接受这类名字。含撇号的名称不参与 expression 检查的 token 匹配。
- 每个声明的字段都有一条 requirement 检查，`source` 取自本次指令原文。

**门禁**（前四条由工具判定，不能由模型豁免）：

1. 摘要一致：文件 `sha256` 等于 `base.sha256`，原件不被写回；归档条目、脚本、宏、图片/按钮/3D 材料静态拒绝。
2. 基线可解释：XML 中每个对象都出现在加载后的事实里，加载后不得出现无法描述的对象类型。
3. 逐字段读回：每个 setter 之后读回声明的字段；未生效返回 `edit_no_effect`，不把“调用被接受”当作成功。
4. 差异白名单：edited 文件的字段级差异必须落在声明的 `object:field` 集合内，否则返回 `preservation_violation`。
5. 重载一致：导出文件在新 applet 中重载后，事实与编辑后状态完全一致，并重跑 requirement 检查。

**交付**：除 result.ggb、request.json、verification.json、preview.png、manifest.json 外，另含 base.ggb（基线副本）、manifest 的 `base` 块与 diff.json（`baseSha256`、`allowed`、`changes`）。preview 会重新加载 base.ggb、重算差异，并核对报告中的 `changes`；报告中删改差异即预览失败。

**错误码**：`base_invalid`（摘要不符）、`base_unsupported`（归档/脚本/宏/材料/对象不支持）、`unknown_edit_target`（对象不存在）、`invalid_edit`（属性与该类型不符）、`edit_no_effect`（读回未生效）、`preservation_violation`（出现未声明的变化）。

**不支持**（返回错误，不静默降质）：增删或重定义对象、修改坐标或数值、重命名、视图/坐标轴调整、拖动样本、脚本、自定义工具、图片、按钮、输入框、三维材料，以及把旧图形“翻译成程序重画”。这些需求按新建构图处理，原文件另存。

## 原生构图程序

每步包含 `id`、`op:"native"`、`mode`、`source`。同一原生程序均使用 native 步骤，按顺序执行。

- `mode:"algebra"`：source 是一条完整英文 GeoGebra 数学语句，包括命名、方程、函数、嵌套命令、列表、矩阵等。例如 `p: y^2=4x`、`A=Point(d)`、`g=Derivative(f)`。
- `mode:"cas"`：source 是 CAS 数学表达式，例如 `Factor(x^4-1)`、`Expand((x+2)^3)`、`Solutions(x^2-1,x)`。工具等待 CAS 就绪，执行计算，并把结果赋给 id，成为可重载的原生对象。
- 可选 `outputs:[ID,...]` 包含 id，缺省为 `[id]`。必须完整匹配原生返回标签，遗漏输出即失败；未返回标签的附属对象也会采集。可声明原生下标名，例如 id 为 `B_{1}`、source 为 `B=Intersect(c,l)`、outputs 为 `["B_{1}","B_{2}"]`。CAS 只物化一个命名结果。输出已存在、缺失或未定义均失败；不允许隐式新增未声明的独立参数。
- 可选 `initial:[x,y]` 只初始化该步可移动点，适用于准线等路径上的点。原生约束仍生效，不把初始化坐标当作题目给定条件。

ID 最长 32 字符，首位为 ASCII 字母，后续为字母、数字或下划线，可包含原生末尾下标花括号，如 `B_{1}`。e/i/x/y/z/pi 和 GgbProbe 前缀保留。中文显示名用 caption。源文本不会拼接到 shell，也不会作为 JavaScript 执行。小数写普通十进制或 `10^(-7)`；不要写会被解释为欧拉常数表达式的 `1e-7`。

构造和探针使用固定 runtime 的异步输入接口，等待引擎按需加载数学模块，每次等待上限 30 秒；CAS 仍按实际使用等待。新数学命令不需新增 TypeScript 包装。任意 JavaScript、脚本触发器、外部资源、文件操作和三维材料不在开放范围；呈现通过结构化 styles 设置。未知命令、计算未决及超时返回真实错误，不允许降级为已通过。

CAS 物化的是当次计算结果，不是动态 CAS 单元；它不会自动保留原 CAS 输入到参数的依赖。需要参数联动时，使用 Algebra 原生命令并加检查。M6 可记录检查的显式假设，但不提供条件解自动提取、动态 CAS 单元或全命令覆盖证明。

## 通用核验

`expression` 检查有 subjects、expression、mode、expected 和 scope。subjects 必须指向程序声明的对象且实际出现在表达式中。expected 为布尔、有限数值或嵌套数组（列表／矩阵），不是模型提交的 passed。每个结构最多 256 个节点、深度最多 8；布尔值不会与数值 0/1 混同，数组逐项采用固定容差和灰区判定。

- Algebra 例：`Distance(T,p)` 期望 0；`AreEqual(Tangent(T,p),b)` 期望 true。
- CAS 例：`Simplify(g(x)-(3x^2+2))` 期望 0。使用原生引擎比较符号关系，不比较格式化字符串来断言数学等价；保留定义域及必要假设。
- CAS 检查可选 `assumptions:["x>0"]`。最多 8 条，每条必须在 prompt 或澄清原文中出现，只允许 mode:cas。工具调用原生 Assume，保存假设及结果；结论只在这些假设下成立，不自动证明假设或条件提取完整。
- 工具创建临时原生探针，检查类型和定义有效性，读取结果后删除，并审计原对象未改变。缺失、未定义、无法读取的元素、未决符号和不匹配的结果类型为 unverified，不能用 API 默认 0 冒充答案。数值对象必须具有有限值。
- `initial` 只检查原构型和文件重载。`sampled` 还在交互副本中检查；至少声明一个交互样本。采样不是全域证明。

可复用的结构检查仍可使用 exists、type、coordinate、dependsOn、style，以及中点、线/圆上的点、圆心半径、平行垂直、等长、距离和非共线。新数学关系优先写表达式，不逐命令增加谓词。type 使用实际事实类型，简单多边形归一为 polygon。

常见实际类型为 point、line、segment、circle、polygon、polyline、numeric、angle、boolean、list 和 text。数值及滑块的 type 检查使用 numeric，不使用 number 或 slider；这不是全部类型的白名单。

依赖证据取自原生 XML 和定义。M6 从原生函数声明排除形参，读取实际参数引用。独立对象不能冒充依赖对象；带复杂局部绑定或命令参数、无法明确解析的依赖返回 unverified。仍不提供完整 GGB 作用域解析器。不能删除依赖要求来绕过这一边界。

直接依赖可以通过中间数学对象表达。例如先保存两个 Distance 结果，再定义比值；先保存文字表达式和位置点，再调用 Text。Text 的定位点必须是大写开头标签的点或内联坐标：`aN`、`ab` 这类小写开头的标签在该参数位不被解析为点对象，命令会失败；`Point(P)` 这类计算式同样不被接受，几何点默认用大写开头命名。多输出标签以实际引擎返回为准。当前 angle 类型的 expression 检查需要明确转为数值，例如 `angle/(1°)-90`；角度单位换算不改变固定容差。

expression 检查的写法限制（本项目实测）：直接用比较表达式并把 `expected` 写成 `true`／`false`，例如 `n>=3`、`curPath-minPath+10^(-9)>=0`；包一层 `if(条件,1,0)` 会得到 unverified（原生探测不解析 `if`）。三点角是**带方向**的，`Angle(O,B,P)` 可能返回 270°，不能用 `角/(1°)-90` 判直角；垂直或直角用 `ArePerpendicular(Line(O,A),切线)`。`Distance(<circle>)` 未定义，圆半径用 `radius` 谓词、圆心加两点距离或 `Circle(I,圆上的点)`。检查的 `subjects` 必须逐字出现在 expression 中，缺失时 `check` 会指出具体检查编号和缺失名称。

## 命名规则

对象名（步骤 id 与 `outputs`）不能与 GeoGebra 的保留名相同，否则该步执行失败或覆盖内建含义：函数与算符（`ln`、`log`、`sin`、`cos`、`tan`、`sqrt`、`abs`、`exp`、`floor`、`round`、`if`、`and`、`or`、`not`、`mod`、`min`、`max`）、常量（`pi`、`e`、`i`、`true`、`false`）、常用命令（`Segment`、`Line`、`Circle`、`Point`、`Midpoint`、`Intersect`、`Distance`、`Angle`、`Polygon`、`Text`、`Slider`、`Locus` 等）。`check` 会以 `Reserved GeoGebra name` 拒绝这类名字，覆盖范围见源码中的 `reservedNames`。实测把 `ln` 用作对象名会得到 `Execution failed or output undefined: ln`。

其他命名注意：单字母 `x`、`y`、`z` 是坐标变量，`x=2` 会被解析为直线；几何点用大写开头（`P`、`NotePos`），小写开头多字母名只用于数值、向量和线段。避免与已有标签重名，引擎自动生成附属标签时也要按实际返回值声明。

## 图形与存在性

`check` 只做静态校验：结构、来源、声明引用、命名和表达式写法，**不启动浏览器，无法证明 GeoGebra 真的创建了某个对象**。对象是否存在由 `build` 判定：每步声明的 `outputs` 必须存在且已定义，`$canvas:0` 要求全部对象已定义。

因此题干点名的图形必须自己画出来：写"作三角形 ABC"就要有 `Polygon(A,B,C)` 或三条边，写"作圆"就要有 `Circle(...)`，并用 `type`／`exists`／周长或半径等检查覆盖它。只放三个点不算画出三角形；`build` 不会替作者补对象，也不会因为缺少题干要求的图形而失败。

## 呈现与交互

`styles:[{object,properties}]` 支持 visible、labelVisible、color（#RRGGBB）、lineThickness（1–13）、lineStyle（0–4）、filling（0–1 的填充不透明度，可写小数）、caption（1–100 字）、fixed。点默认显示名称。原生列表和数值不强制在图形画布可见；关键几何对象需明确 `visible:true` 及对应 style 检查。

填充与线条同色：GeoGebra 一个对象只有一种颜色，`color` 同时用于描边与填充，`filling` 只改不透明度。所以"虚线 + 填充"要写在同一个对象上（`lineStyle:1` 配 `filling:0.5`），否则不透明的填充面会盖住同位的虚线轮廓。

`view:{xMin,xMax,yMin,yMax}` 给出需要包含的图形范围；工具按画布比例补足视野，保持两轴等比例。`display:"graphics"`（默认）显示二维画布；`display:"algebra"` 显示完整原生 Algebra 视图，允许无自由点、无拖动样本，不强行执行图形缩放检查。

`interactions:[{point,dx,dy}]` 是真实鼠标拖动样本，支持实际可移动自由点和路径点。像素位移各不超过 120，长度至少 20，同一点不重复。代数视图不能声明画布拖动。

另可声明 `{parameter:"a",value:2}`。参数必须是独立、可移动、未固定的数值滑块，目标在有限区间内且实际发生变化。同一参数可用不同目标值采样；每个样本都独立重载原 GGB。报告 method 为 `native_value`，表示原生 API 参数设置，不冒充鼠标拖动。Algebra 视图也允许参数采样。

每个参数样本在目标状态核验后，会在同一副本恢复原值，再执行初态核验及完整快照比较。sample.roundTrip 保存原值 value 和恢复后的 after 报告；往返失败阻止交付，不能忽略隐藏未定义对象。preview 要求对应证据并重算判定；旧参数交付缺少 roundTrip 时必须重新 build。鼠标样本不要求用坐标赋值恢复。真实拖动若有距离目标不超过 10 屏幕像素的其他可见、已定义点，会提前拒绝并记录 target、screen 与逐点 overlaps（含 moveable 与 fixed 标记）：可移动点按重叠可移动点拒绝，固定点（`fixed:true`）按重叠固定点拒绝，依赖型可见点只记录不提前拒绝；其他未移动情况仍保留原时限。

有界的可变数量构造，可以先生成容量固定的原生辅助对象，再取活动前缀。`Take(allPoints,1,count)` 取前 count 个对象，二参数 Take 从指定位置取到末尾。若只要求轮廓，可依次保存 `active=Take(allPoints,1,count)`、`first=Element(active,1)`、`closed=Append(active,first)`、`outline=Polyline(closed)`；拆开命令以保留直接依赖。所有辅助对象必须始终有定义，容量上限必须来自题目且满足 steps 限制。周长从实际相邻点距离求和并独立核验，不用“边数×边长”同时生成和检查结果。若要求填充面或原生 Polygon 类型，不能将轮廓表示当作完成。

M1 回归的 freePoint/command 原语保留在协议 2，仍编译到同一执行器；旧命令表不限制 native 程序。不要在同一程序混合两种形式。几何示例见 examples/v2-cases/triangle.json 和 examples/v2-cases/parabola.json；代数、函数、统计及混合验收输入保留在 tests/fixtures，仅用于回归测试与覆盖记录。

## 交付与失败

构造、必需核验、GGB 重载及交互检查通过后，关闭资源，再原子提交 result.ggb、request.json、verification.json、preview.png 和 manifest.json。M6 清单协议为 2，milestone 为 M6；preview 复核报告、摘要和实际重载结果。构图与验证均 headless。自动预览复核使用 `preview --delivery <dir> --headless --once`，通过全部原有预览门禁后关闭资源并退出；`--once` 不得与可见预览组合。成功后必须以 preview 自动打开系统默认浏览器作为最后的工具动作，加载同一 GGB；页面确认加载后输出就绪。点击页面“结束预览”或取消进程释放服务，不回写文件；仅关闭默认浏览器标签页不保证结束进程。

容量和时限由 doctor/schema 给出。失败保留运行路径和原因；CAS 不就绪、语法错误、对象未定义、探针污染原对象和数学条件不满足均不能交付。最多三次新运行，保留要求；未验证必须说明能力缺口。

外层 run.json 的 totalMs、timings 和 observationTimings 仅供性能诊断，不是检查结果。阶段记录 phase、startMs、durationMs，预加载时可以重叠；观察计时细分 casMs、probesMs、valuesMs、snapshotMs。重载失败时保留已有两阶段报告；快照差异另写 snapshot-differences.json，记录对象、字段、expected 与 actual。字段级诊断与正式比较共用规范化和容差，不能用诊断替代门禁。

官方依据：[Apps API](https://geogebra.github.io/docs/reference/en/GeoGebra_Apps_API/)、[异步 API 源码](https://github.com/geogebra/geogebra/blob/main/source/web/web-common/src/main/java/org/geogebra/web/html5/main/DefaultExportedApi.java)、[Assume](https://geogebra.github.io/docs/manual/en/commands/Assume/)、[命令目录](https://geogebra.github.io/docs/manual/en/commands/All_Commands/)。接口行为以固定 runtime 实测为准。命令可接入不等于全部命令已验收，也不等于任意数学问题可求解。
