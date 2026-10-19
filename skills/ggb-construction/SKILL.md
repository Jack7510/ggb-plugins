---
name: ggb-construction
description: 根据中英文题目文字或图片，新建 GeoGebra 二维数学构造，或修改已有 GGB 的显示属性及继续构造；核验并交付可交互 GGB。用于分析与作图，不提供题目答案或完整证明；不支持三维、删除或重命名已有对象。
---

# GeoGebra 二维数学与代数

Agent 理解题意、选择原生构法并编写独立检查；工具负责执行、采集事实、核验和交付。新题改变程序，不增加题型分支、命令包装或构图旁路。

## 分析与作图边界

- 只分析条件、对象关系和构图方法。不提供选项判断、待求答案、最终关系结论或完整证明；此约束覆盖回复、caption、Text、截图及可见代数对象。
- 可展示题目已知信息、对象名与必要构图提示。内部计算、CAS、expected 和审计证据须完整保留，但不作为解答主动展示。
- 保留原题、来源及确认的澄清。图片比例不是已知数值；只有影响正确性的必要条件不明时才提问。自行选择的初态须与题设区分。
- 原题要求求解时说明本插件只分析和作图。不删除条件以适配能力，也不把构图核验通过说成原题已解答。

## 选择模式与按需读取

先确定本次操作，再读 [契约阅读索引](references/capabilities.md#按需阅读)。不默认读取整份契约、全部参考或所有模式。

| 当前操作 | 必须读取的契约章节 |
| --- | --- |
| 新建 | [请求](references/capabilities.md#请求)、[原生程序](references/capabilities.md#原生构图程序)、[命名](references/capabilities.md#命名规则) |
| 只改已有图的显示属性 | [编辑](references/capabilities.md#编辑已有-ggbp0)，先 inspect，保留原文件与未声明字段 |
| 在已有图上增加对象或受控改值 | [续构](references/capabilities.md#构造修改已有-ggb)；新增对象另读原生程序与命名规则 |
| 所有操作 | [核验](references/capabilities.md#通用核验)、[交付与失败](references/capabilities.md#交付与失败) |

涉及显示或动态采样时再读 [呈现与交互](references/capabilities.md#呈现与交互)；需要构法参考时再读 [构图模式](references/patterns.md)。按相关标题定位内容，不把示例参数、分支或公式套成题设。具体字段以契约和工具诊断为准。

## 准备与语言

从本目录向上两级定位 `<plugin>`，只调用该安装副本的 `dist/src/cli.js`，不依赖开发仓库。首次缺依赖按插件 README 执行 setup-plugin；其他故障不重复安装。

本会话首次使用该副本时运行 `node <plugin>/dist/src/cli.js doctor`，确认 smoke、casSmoke 通过。同一会话且副本未变可复用结果；新会话、升级、runtime 重装或环境错误后重做。不借用其他会话的标记；build 和 preview 始终保留自己的门禁，不需要额外模型 API Key。

按题目语言设置 locale：中文 zh-CN，英文 en。回复、澄清、caption、Text 和预览同语言，用户明确指定的文字优先。原题、source、澄清及 assumptions 保留来源语言；命令、协议字段和错误码保持固定名称。

## 生成与核验原则

- 用原生数学程序表达题意，不用旧命令表限制构法，不写 Python／JavaScript 构图旁路。只在接口或重载不确定时查询官方手册。
- 每项题目条件与显示要求都关联原文 source 和检查。关键对象须可见；题干点名的图形应真实存在，不能只放顶点代替图形。
- 期望值先算后写：从题设与构造独立推导 expected，不抄失败报告或上一轮观测。检查引用实际对象，明确结果类型、单位、定义域与分支；不以常量、自我复述或截图代替核验。
- 区分构造正确性、题设约束与交互行为，用 purpose 记录证据目的。保留构造检查，需要独立证据时另行推导；purpose 和 warnings 均不认证独立证明或豁免门禁。
- 可变量默认使用滑块或可拖点；题目给定数值或要求静态时才固定。动态关系用真实依赖与相关输入变化核验；固定约束仍逐样本复验，无关移动不算联动证据。
- 选择规模受控、参数往返后对象仍有定义的表示。避免拖动目标与其他可见点同址；不以赋值替代真实拖动，不忽略隐藏的未定义对象。
- CAS 物化结果不自动保留动态依赖。假设只能来自原题或确认回答；不因可交互而宣称有限样本是全域证明。能力不足时保留未核验项并报告限制。

## 执行、修复与交付

保存请求 JSON，使用绝对路径；outputDir 为用户工作目录根，title 概括题目。先结构预检，再执行：

```sh
node <plugin>/dist/src/cli.js check --request <absolute-request.json>
node <plugin>/dist/src/cli.js build --request <absolute-request.json>
```

check 不证明引擎语法或数学关系。构造、重载、交互和截图均 headless，失败与修复证据保留。读取返回 JSON、verification.json 和 run.json；仅修证据指出的根因及相关项，不改无关要求，不放宽容差，不自判 passed。

最多三次新运行，每次空白 applet；达到上限仍失败则报告条件与能力缺口。已有图用 inspect 的精确身份与当前摘要，不重画，不夹带删除、重命名或未请求的修改。最终答复依据实际交付路径和 diff，不猜文件名。

全部核验成功后，最后的工具动作是自动打开交付，无需再次确认：

```sh
node <plugin>/dist/src/cli.js preview --delivery <absolute-delivery-dir>
```

preview 用系统默认浏览器加载同一 GGB，页面确认加载即输出就绪并释放服务、退出进程；applet 在窗口中独立运行，关闭窗口结束预览，刷新需重新执行 preview。失败保留文件并说明未打开。自动复核的 --headless --once 不能代替最终可见预览。服务释放及诊断细节见交付契约。

交付 GGB、报告和截图，说明实际修改、已验条件、有限样本与未验项。满足要求后结束，不追加无关美化或重复核验；命令支持范围有疑问时再读 [覆盖边界](references/command-coverage.md)。
