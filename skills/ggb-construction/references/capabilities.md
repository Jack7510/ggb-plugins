# 构图能力和请求契约

构图和核验使用统一入口。源码 `src/schema.ts` 是字段及限制的权威定义；`examples/` 仅用于理解格式和回归，不是题型模板。当前是仓库内 Skill，正式插件打包和安装验收留在 M4。

## 请求

```json
{
  "protocolVersion": 1,
  "prompt": "作线段PQ的中点N。",
  "locale": "zh-CN",
  "outputDir": "/absolute/output",
  "plan": {
    "program": [
      { "id": "P", "op": "freePoint", "x": -2, "y": 0 },
      { "id": "Q", "op": "freePoint", "x": 2, "y": 1 },
      { "id": "N", "op": "command", "name": "Midpoint", "args": [{ "ref": "P" }, { "ref": "Q" }] }
    ],
    "requirements": [
      { "id": "mid", "source": "作线段PQ的中点N", "checks": [
        { "kind": "midpoint", "subjects": ["N", "P", "Q"], "scope": "sampled" }
      ] }
    ],
    "interactions": [{ "point": "P", "dx": 60, "dy": -40 }]
  }
}
```

可选顶层 `clarifications` 为 `{question, answer}[]`；source 必须是 prompt 或澄清原文中的片段。所有 requirement 都必须有非空 checks；不接受未知字段、脚本、外部文件输入或模型写入的结果。

对象 ID 为 1–32 位 ASCII 字母、数字或下划线，首位为字母；保留名 `e/i/x/y/z/pi` 不可用。依赖可以前向引用，工具会拓扑排序；重复名、未知引用、循环和类型不符在执行前拒绝。数值须有限且绝对值不超过 10000。坐标未来自题目时是构图选择。

## 构造原语

`freePoint` 使用 `id, op, x, y`。原生命令使用 `id, op:"command", name, args`，参数只能是 `{ref: ID}` 或数值，不接受原始命令字符串和嵌套表达式。

| name | 参数类型 | 输出 |
| --- | --- | --- |
| Segment | 点、点 | 线段 |
| Line | 点、点；或点、直线（过点的平行线） | 直线 |
| Midpoint | 点、点 | 点 |
| PerpendicularLine | 点、直线 | 直线 |
| Intersect | 直线、直线 | 点 |
| Circle | 圆心点、经过点；或圆心点、正数半径 | 圆 |
| Polygon | 3–16 个点 | 多边形 |

目前不支持两圆交点、滑块、函数表达式、三维和任意 GGBScript。实际不定义的对象会阻止交付。原生命令可能创建额外边对象；若与显式 ID 冲突，工具拒绝覆盖，重新选择内部 ID。

`plan.styles` 可选，格式为 `{object: ID, properties: {...}}[]`；每个目标只能出现一次。属性包括 `visible`、`labelVisible`、`color`（六位十六进制）、`lineThickness`（1–13）、`lineStyle`（0–4）和 `caption`（1–100 字）。只对路径对象设置线宽或线型。程序声明对象默认可见，点默认显示名称；关键样式另外写入 requirement 的 style 检查。原生附属对象遵循 GeoGebra 语义；隐藏多边形会同时隐藏其自动边，不要求调用方声明边的样式。中文或希腊显示名可使用 caption，内部 ID 仍用 ASCII。

`plan.view` 可选，包含 `xMin,xMax,yMin,yMax`。省略时按实际点和圆的边界取景并保持单位比例。交互点及目标位置必须在视野内。视野参数用于控制画面，当前没有布局或视野边界的验收谓词；不能据此声称已核验这类必需要求。

## 核验谓词

每个 check 必填 `kind, subjects, scope`。`initial` 在构造与重载时检查；`sampled` 还在每次声明的鼠标拖动后检查。这里的 sampled 只说明这些有限样本通过。

| kind | subjects 顺序 | 额外字段 |
| --- | --- | --- |
| exists | 对象 | 无 |
| type | 对象 | `objectType`: point/segment/line/circle/polygon |
| coordinate | 点 | `coordinates`: [x,y] |
| midpoint | 中点、端点、端点 | 无；sampled 同时要求真实依赖两端点 |
| pointOn | 点、直线或圆 | 无 |
| center | 圆、圆心点 | 无 |
| radius | 圆 | 非负 `value` |
| parallel / perpendicular | 直线、直线 | 无 |
| equalLength | 线段、线段 | 无 |
| distance | 点、点 | 非负 `value` |
| nonCollinear | 三个点 | 无 |
| dependsOn | 派生对象、至少一个输入对象 | 无；检查真实传递依赖 |
| style | 对象 | `properties`: 非空样式对象 |

工具还自动核对程序与真实构造定义、类型、初始坐标、可见性及指定样式。数值容差固定为 `1e-8 * max(1, scale)`；超出容差但未超过十倍的灰区返回 unverified。未知观察、缺项或不通过结果阻止正式交付。调用方不能指定容差。

`plan.interactions` 必填 1–12 个 `{point,dx,dy}`，只能拖动声明的自由点，每点一个样本；dx/dy 是屏幕像素，绝对值不超过 120，位移长度至少 20。每个 sampled 几何关系检查必须有相关根自由点参与；类型、样式和依赖检查也会在每个样本后复核。拖动样本在独立的文件副本中执行，原交付构型不变；显式要求任意拖动或全域证明时说明当前保证不足。

限制：请求文件 128 KiB、题干 12000 字符、64 个对象声明、64 项要求、总计 256 个检查、GGB 10 MiB、验证报告 16 MiB。构图总时限 120 秒，doctor 总时限 45 秒，单次浏览器等待及导出/加载回调上限 30 秒。doctor 输出当前限制、能力、容差和实际版本。超过限制或失败时保留运行目录，不自动恢复。

## 官方依据

- [GeoGebra Apps API](https://geogebra.github.io/docs/reference/en/GeoGebra_Apps_API/)
- [命令手册](https://geogebra.github.io/docs/manual/en/Commands/)

实际执行以固定本地 runtime 为准。当前插件不额外调用模型 API；本地工具不承担自然语言求解。

## 交付与诊断边界

交付格式继续使用 M2 契约。浏览器和本地服务关闭后，工具将完整临时目录原子重命名为 delivery；此前失败不产生正式交付。此后外层 run.json 写入失败只返回 warnings，不撤销交付。预览独立复核清单、报告及实际文件。失败诊断包含运行路径、阶段和附加清理错误；无法写入诊断时仍保留原始错误。强制退出不保证清理，工具不自动恢复或重试。
