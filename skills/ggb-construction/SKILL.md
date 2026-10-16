---
name: ggb-construction
description: 根据文字或图片中的二维数学与代数题生成 GeoGebra 原生程序，通过 Algebra/CAS 构造、逐条件核验并交付可交互 GGB。适用于二维几何、函数和代数结果；不用于三维、已有 GGB 续题或一般数学证明。
---

# GeoGebra 二维数学与代数

你负责理解题目、选择构法、生成原生数学程序和独立检查；工具负责真实执行、事实采集、核验和交付。新题改变程序，不增加题型分支、命令包装或专用旁路脚本。

先读取 [能力和请求契约](references/capabilities.md)。从本 Skill 目录向上两级定位 `<plugin>`。只调用当前安装副本的 `dist/src/cli.js`，不依赖开发仓库。首次缺少依赖时按插件 README 执行 setup-plugin；其他故障不要重复安装。运行前调用 `node <plugin>/dist/src/cli.js doctor`，确认 smoke、casSmoke 通过；不需要额外模型 API Key。

## 生成程序与检查

- 保存原文、来源和实际澄清。图片先转述题干及图中的明确条件，不能把图形比例当作已知数值。仅在必要条件有歧义时提问。
- 按协议 2 生成 native 步骤。GeoGebra 原生引擎处理命令、函数、表达式及重载；必要时查询官方手册。不用旧八命令表限制新题，不写 Python/JavaScript 构图旁路。
- 每项题目条件关联 requirement 的原文 source 和检查。自行选择的初始坐标必须说明。显示、标签、颜色、线宽等要求也要检查，关键对象声明可见。
- 用真实命令依赖构造联动。路径点可用 initial 初始化；CAS 步骤是当次结果物化，不自动成为动态 CAS 构造。对动态要求另加依赖和相关交互检查。
- 数学关系用原生 expression 检查：布尔期望 true/false，数值或 CAS 恒等差期望具体数值；列表／矩阵用嵌套 expected。CAS 假设必须来自原文，并在 assumptions 中显式声明。检查必须引用相关实际对象，不能用常量、自我复述或只看截图代替条件核验。
- 明确初始范围、定义域、条件解和有限样本。纯代数使用 display:algebra，可无自由点及交互；几何按需声明真实拖动样本，滑块用 parameter/value 采样；报告区分原生参数设置和鼠标拖动。超出实际核验范围的必需要求不能删除后宣称通过。

## 执行与交付

保存 JSON，使用绝对路径：

```sh
node <plugin>/dist/src/cli.js build --request <absolute-request.json>
```

构造、重载、探针和交互验证均 headless，不打开中间窗口。截图保存为交付目录的 preview.png；失败诊断写在工作区。

读取返回 JSON、verification.json 和 run.json。按证据修正程序，保留原始要求，不放宽容差、不提交自判 passed。最多三次，每次是新运行和空白 applet；仍失败就说明具体条件及能力缺口，不在残留画布续接。

成功若带 warnings，说明诊断写入问题，完整交付仍有效。全部验证成功后才调用：

```sh
node <plugin>/dist/src/cli.js preview --delivery <absolute-delivery-dir>
```

最终预览由本机 Google Chrome 加载同一 result.ggb。保留前台进程，等待就绪 JSON；关闭预览页或窗口后会退出专用浏览器并释放服务。自动化复核使用 --headless，完成后关闭测试会话。预览失败保留文件并单独报告。

交付 GGB、报告和截图，说明已验证条件及有限样本。M5 不宣称全部原生命令已验收，不把数值采样或未决 CAS 结果当作一般证明。旧协议 1 的请求与交付须按新契约重新生成。
